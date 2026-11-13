#!/usr/bin/env bash
# Install the Nginx sites and ~/deploy.sh on the VPS, then build both websites.
#   ssh ubuntu@<VPS_IP> 'bash -s' < deploy/vps/enable_sites.sh
# Run after setup_server.sh. Safe to re-run (it does not touch certbot's
# HTTPS changes once they exist).
set -euo pipefail
SRC=~/covershift/deploy/vps
cd ~/covershift && git pull -q

install -m 755 $SRC/deploy.sh ~/deploy.sh

if ! sudo grep -q "managed by Certbot" /etc/nginx/sites-available/covershift 2>/dev/null; then
  sudo cp $SRC/nginx-covershift.conf /etc/nginx/sites-available/covershift
fi
sudo ln -sf /etc/nginx/sites-available/covershift /etc/nginx/sites-enabled/covershift
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

~/deploy.sh web
echo "sites enabled; test before DNS switch with:"
echo "  curl -H 'Host: app.covershift.in' http://<VPS_IP>/"
