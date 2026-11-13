#!/usr/bin/env bash
# Pack everything the VPS needs from the AWS server into one file:
#   - database dump from RDS
#   - every stored file (avatars + documents) fetched from S3
#   - the backend .env (secrets stay machine to machine, never printed)
#
#   ssh -i ~/.ssh/covershift-key.pem ubuntu@65.1.38.162 'bash -s' < deploy/vps/export_from_aws.sh
#
# Output: ~/covershift-export.tar.gz on the AWS server. Read-only for the
# database and S3. Pass STOP_API=1 for the final cut-over export, which stops
# the API first so nothing is written after the dump.
set -euo pipefail
cd ~/covershift/backend
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

if [ "${STOP_API:-0}" = "1" ]; then
  sudo systemctl stop covershift
  echo "API stopped (final export)"
fi

echo "== database"
.venv/bin/python - "$OUT" <<'EOF'
import os, subprocess, sys
from sqlalchemy.engine import make_url
from app.core.config import settings
url = make_url(settings.DATABASE_URL)
cnf = os.path.join(sys.argv[1], "my.cnf")
with open(cnf, "w") as f:
    f.write(f"[client]\nuser={url.username}\npassword={url.password}\nhost={url.host}\nport={url.port or 3306}\n")
os.chmod(cnf, 0o600)
with open(os.path.join(sys.argv[1], "db.sql"), "wb") as out:
    subprocess.run(
        ["mysqldump", f"--defaults-extra-file={cnf}", "--single-transaction", "--no-tablespaces",
         "--set-gtid-purged=OFF", "--routines", "--triggers", "--column-statistics=0", url.database],
        stdout=out, check=True,
    )
os.remove(cnf)
EOF
echo "dump: $(du -h "$OUT/db.sql" | cut -f1), tables: $(grep -c '^CREATE TABLE' "$OUT/db.sql")"

echo "== files"
.venv/bin/python - "$OUT/uploads" <<'EOF'
import sys
from pathlib import Path
from sqlalchemy import text
from app.core.database import engine
from app.services import storage
dest = Path(sys.argv[1])
with engine.connect() as c:
    keys = [r[0] for r in c.execute(text("SELECT file_path FROM documents WHERE file_path IS NOT NULL"))]
    keys += [r[0].removeprefix("/uploads/") for r in c.execute(text(
        "SELECT avatar_url FROM users WHERE avatar_url LIKE '/uploads/%'"))]
ok = missing = 0
for key in keys:
    data = storage.read(key)
    if data is None:
        missing += 1
        print("  missing:", key)
        continue
    target = dest / key
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    ok += 1
print(f"files copied: {ok}, missing: {missing}")
EOF

echo "== settings"
cp .env "$OUT/backend.env"
chmod 600 "$OUT/backend.env"

tar -czf ~/covershift-export.tar.gz -C "$OUT" .
chmod 600 ~/covershift-export.tar.gz
echo "export ready: ~/covershift-export.tar.gz ($(du -h ~/covershift-export.tar.gz | cut -f1))"
