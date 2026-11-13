#!/usr/bin/env bash
# Deploy the latest code from GitHub main to the VPS: backend + admin web + landing.
# Installed as ~/deploy.sh on the VPS by enable_sites.sh:
#   ssh ubuntu@<VPS_IP> '~/deploy.sh'            # everything
#   ssh ubuntu@<VPS_IP> '~/deploy.sh backend'    # API only
#   ssh ubuntu@<VPS_IP> '~/deploy.sh web'        # admin web + landing only
# Stops at the first failure. A failed web build leaves the live site as it was.
set -euo pipefail
WHAT=${1:-all}
API_URL=https://api.covershift.in/api/v1
cd ~/covershift

before=$(git rev-parse --short HEAD)
git fetch -q origin main
git reset -q --hard origin/main          # server copy always mirrors GitHub main
after=$(git rev-parse --short HEAD)
echo "code: $before -> $after  ($(git log -1 --format=%s))"

if [ "$WHAT" = all ] || [ "$WHAT" = web ]; then
  # One install for both sites: `npm ci` wipes node_modules, so installing per
  # site would leave only the last site's packages.
  npm ci -s -w @covershift/web -w @covershift/landing >/dev/null
  for site in web:app landing:landing; do
    pkg=${site%%:*}; dir=${site##*:}
    echo "== building $pkg"
    (cd apps/$pkg && VITE_API_URL=$API_URL npm run -s build >/dev/null)
    rsync -a --delete apps/$pkg/dist/ /var/www/$dir/
    echo "$pkg deployed -> /var/www/$dir"
  done
fi

if [ "$WHAT" = all ] || [ "$WHAT" = backend ]; then
  echo "== backend"
  cd ~/covershift/backend
  .venv/bin/pip install -q -r requirements.txt
  .venv/bin/alembic upgrade head 2>&1 | grep -E "Running upgrade" || echo "migrations: already up to date"
  sudo systemctl restart covershift
  for i in $(seq 1 15); do
    if curl -sf http://127.0.0.1:8000/health >/dev/null; then
      echo "deployed OK: $(curl -s http://127.0.0.1:8000/health)"
      exit 0
    fi
    sleep 1
  done
  echo "API did not come back healthy — last log lines:"
  sudo journalctl -u covershift -n 30 --no-pager
  exit 1
fi
