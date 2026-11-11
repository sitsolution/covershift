#!/usr/bin/env bash
# Replace the server's VAPID (web push) key pair with a freshly generated one.
#   ssh -i ~/.ssh/covershift-key.pem ubuntu@65.1.38.162 'bash -s' < backend/scripts/rotate_vapid_keys.sh
#
# Backs up .env, writes the new keys (the private key is never printed),
# removes browser subscriptions made with the old key (browsers re-subscribe
# on their next visit), and restarts the API.
set -euo pipefail
cd ~/covershift/backend

cp .env ".env.bak-$(date +%Y%m%d%H%M)"

.venv/bin/python - <<'EOF'
import base64, re
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

key = ec.generate_private_key(ec.SECP256R1())
b64 = lambda raw: base64.urlsafe_b64encode(raw).decode().rstrip("=")
private = b64(key.private_numbers().private_value.to_bytes(32, "big"))
public = b64(key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint))

env = Path(".env")
text = env.read_text()
for name, value in (("VAPID_PRIVATE_KEY", private), ("VAPID_PUBLIC_KEY", public)):
    line = f"{name}={value}"
    text, n = re.subn(rf"^{name}=.*$", line, text, flags=re.M)
    if n == 0:
        text = text.rstrip("\n") + f"\n{line}\n"
env.write_text(text)
print("new VAPID public key:", public)
EOF

.venv/bin/python - <<'EOF'
from sqlalchemy import text
from app.core.database import engine
with engine.begin() as c:
    n = c.execute(text("DELETE FROM web_push_subscriptions")).rowcount
print("old browser subscriptions removed:", n)
EOF

sudo systemctl restart covershift
for i in $(seq 1 15); do
  if curl -sf http://127.0.0.1:8000/health >/dev/null; then
    echo "API restarted OK"
    exit 0
  fi
  sleep 1
done
echo "API did not come back healthy"; exit 1
