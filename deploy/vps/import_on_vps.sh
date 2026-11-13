#!/usr/bin/env bash
# Load the AWS export into the VPS and start the API on it.
#   ssh ubuntu@<VPS_IP> 'bash -s' < deploy/vps/import_on_vps.sh
#
# Expects ~/covershift-export.tar.gz (made by export_from_aws.sh). It:
#   - replaces the local covershift database with the dump
#   - puts the files under backend/uploads
#   - writes backend/.env from the AWS one, switched to the local database
#     and local file storage
#   - runs migrations and (re)starts the API
# Safe to re-run with a newer export (the final cut-over export).
set -euo pipefail
ARCHIVE=~/covershift-export.tar.gz
APP=~/covershift/backend
[ -f "$ARCHIVE" ] || { echo "missing $ARCHIVE"; exit 1; }
IN=$(mktemp -d)
trap 'rm -rf "$IN"' EXIT
tar -xzf "$ARCHIVE" -C "$IN"

echo "== database"
mysql -e "DROP DATABASE IF EXISTS covershift; CREATE DATABASE covershift CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql covershift < "$IN/db.sql"
echo "tables: $(mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='covershift'"), users: $(mysql -N covershift -e 'SELECT COUNT(*) FROM users')"

echo "== files"
mkdir -p "$APP/uploads"
[ -d "$IN/uploads" ] && rsync -a "$IN/uploads/" "$APP/uploads/"
echo "files on disk: $(find "$APP/uploads" -type f | wc -l)"

echo "== settings"
DB_PW=$(cat ~/.covershift-db-password)
UPLOADS="$APP/uploads"
python3 - "$IN/backend.env" "$APP/.env" "$DB_PW" "$UPLOADS" <<'EOF'
import re, sys
src, dst, pw, uploads = sys.argv[1:]
text = open(src).read()
def put(name, value):
    global text
    line = f"{name}={value}"
    text, n = re.subn(rf"^{name}=.*$", lambda _: line, text, flags=re.M)
    if n == 0:
        text = text.rstrip("\n") + f"\n{line}\n"
put("DATABASE_URL", f"mysql+pymysql://covershift:{pw}@127.0.0.1:3306/covershift?charset=utf8mb4")
put("STORAGE_BACKEND", "local")
put("UPLOAD_DIR", uploads)
open(dst, "w").write(text)
EOF
chmod 600 "$APP/.env"
echo ".env written (local database, local file storage)"

echo "== migrations + start"
cd "$APP"
.venv/bin/alembic upgrade head 2>&1 | grep -E "Running upgrade" || echo "migrations: already up to date"
sudo systemctl restart covershift
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8000/health >/dev/null; then
    echo "API running: $(curl -s http://127.0.0.1:8000/health)"
    rm -f "$ARCHIVE"
    exit 0
  fi
  sleep 1
done
echo "API did not come up, last log lines:"
sudo journalctl -u covershift -n 30 --no-pager
exit 1
