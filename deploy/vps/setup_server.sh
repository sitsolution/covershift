#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 VPS for CoverShift.
#   ssh root@<VPS_IP> 'bash -s' < deploy/vps/setup_server.sh
#
# Run as root after your SSH key is in /root/.ssh/authorized_keys. It:
#   - creates the "ubuntu" deploy user (same layout as the old EC2 server)
#   - turns off SSH password login (key login only)
#   - adds swap, firewall, automatic security updates, fail2ban
#   - installs Nginx, MySQL, Python, Node 20, certbot
#   - creates the covershift database and a local DB user
#   - clones the repo and installs the backend
# Safe to re-run.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
REPO=https://github.com/sitsolution/covershift.git
APP_USER=ubuntu
HOME_DIR=/home/$APP_USER

[ "$(id -u)" -eq 0 ] || { echo "run as root"; exit 1; }
[ -s /root/.ssh/authorized_keys ] || { echo "no SSH key in /root/.ssh/authorized_keys, refusing to disable password login"; exit 1; }

echo "== packages"
apt-get update -q
apt-get upgrade -yq
apt-get install -yq nginx mysql-server python3-venv python3-dev build-essential git curl \
  certbot python3-certbot-nginx ufw fail2ban unattended-upgrades rsync dnsutils
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -yq nodejs
fi

echo "== swap (2 GB)"
if [ "$(stat -c %s /swapfile 2>/dev/null || echo 0)" -lt 2000000000 ]; then
  swapoff /swapfile 2>/dev/null || true; rm -f /swapfile
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

echo "== deploy user"
if ! id $APP_USER >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" $APP_USER
fi
usermod -aG sudo $APP_USER
echo "$APP_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/90-$APP_USER && chmod 440 /etc/sudoers.d/90-$APP_USER
install -d -m 700 -o $APP_USER -g $APP_USER $HOME_DIR/.ssh
# our keys only: the hosting company's support key stays on root alone
grep -v "milesweb" /root/.ssh/authorized_keys > $HOME_DIR/.ssh/authorized_keys
chown $APP_USER:$APP_USER $HOME_DIR/.ssh/authorized_keys && chmod 600 $HOME_DIR/.ssh/authorized_keys

echo "== ssh: keys only"
# "01-" so it is read before the image's own files (sshd keeps the first value it sees)
rm -f /etc/ssh/sshd_config.d/90-covershift.conf
cat > /etc/ssh/sshd_config.d/01-covershift.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
mkdir -p /run/sshd
sshd -t
systemctl reload ssh 2>/dev/null || systemctl restart ssh

echo "== firewall"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable
systemctl enable --now fail2ban unattended-upgrades

echo "== mysql"
cat > /etc/mysql/mysql.conf.d/90-covershift.cnf <<'EOF'
[mysqld]
bind-address = 127.0.0.1
innodb_buffer_pool_size = 512M
max_connections = 100
EOF
systemctl restart mysql
PW_FILE=$HOME_DIR/.covershift-db-password
if [ ! -s $PW_FILE ]; then
  openssl rand -hex 24 > $PW_FILE
  chown $APP_USER:$APP_USER $PW_FILE && chmod 600 $PW_FILE
fi
DB_PW=$(cat $PW_FILE)
mysql <<EOF
CREATE DATABASE IF NOT EXISTS covershift CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'covershift'@'localhost' IDENTIFIED BY '$DB_PW';
ALTER USER 'covershift'@'localhost' IDENTIFIED BY '$DB_PW';
GRANT ALL PRIVILEGES ON covershift.* TO 'covershift'@'localhost';
FLUSH PRIVILEGES;
EOF
# lets the deploy user run mysql / mysqldump without typing the password
printf '[client]\nuser=covershift\npassword=%s\n' "$DB_PW" > $HOME_DIR/.my.cnf
chown $APP_USER:$APP_USER $HOME_DIR/.my.cnf && chmod 600 $HOME_DIR/.my.cnf

echo "== code + backend"
sudo -u $APP_USER bash <<EOF
set -e
cd $HOME_DIR
[ -d covershift/.git ] || git clone -q $REPO covershift
cd covershift && git pull -q
cd backend
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
mkdir -p uploads
EOF

echo "== web roots"
install -d -o $APP_USER -g $APP_USER /var/www/app /var/www/landing

echo "== api service"
cat > /etc/systemd/system/covershift.service <<EOF
[Unit]
Description=Covershift API (FastAPI / uvicorn)
After=network-online.target mysql.service
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$HOME_DIR/covershift/backend
ExecStart=$HOME_DIR/covershift/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1 --proxy-headers --forwarded-allow-ips=127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable covershift >/dev/null

echo "== nightly DB backup (02:00, keeps 7 days, on this server)"
install -d -o $APP_USER -g $APP_USER $HOME_DIR/backups
cat > /etc/cron.d/covershift-backup <<EOF
0 2 * * * $APP_USER mysqldump --single-transaction --no-tablespaces covershift 2>/dev/null | gzip > $HOME_DIR/backups/covershift-\$(date +\%F).sql.gz && find $HOME_DIR/backups -name '*.sql.gz' -mtime +7 -delete
EOF

echo
echo "setup done: $(lsb_release -ds), python $(python3 --version | cut -d' ' -f2), node $(node -v), $(mysql --version | awk '{print $3}')"
echo "next: copy data from AWS (deploy/vps/README.md step 3)"
