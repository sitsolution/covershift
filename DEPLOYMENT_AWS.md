# AWS deployment — Covershift

Production runs in the client's AWS account, region **Asia Pacific (Mumbai) `ap-south-1`**.
No secrets live in this file: passwords and API keys are only in the server's
`backend/.env` and the AWS console

## What runs where

| Part | Service | Address |
|---|---|---|
| Backend API (FastAPI) | EC2 `covershift-backend` (t3.small, Ubuntu 24.04) behind Nginx | `http://65.1.38.162` (Elastic IP) — HTTPS pending domain |
| Database | RDS MySQL 8.4 `covershift-db` (db.t4g.micro), private | `covershift-db.cj28u8i8op4i.ap-south-1.rds.amazonaws.com:3306`, database `covershift` |
| Admin web | Amplify app `covershift-admin` (monorepo root `apps/web`) | https://main.d259or0epvbw3u.amplifyapp.com |
| Landing page | Amplify app `covershift-landing` (monorepo root `apps/landing`) | https://main.d35ysyd3uk0dlf.amplifyapp.com |

The database only accepts connections from the backend server (security groups
`rds-ec2-2` ↔ `ec2-rds-2`). It is not reachable from the internet.

### On the server

| Path / unit | What |
|---|---|
| `~/covershift` | Git checkout of `sitsolution/covershift`, always reset to `origin/main` by the deploy script |
| `~/covershift/backend/.env` | Production settings (mode 600, never committed) |
| `~/covershift-data/uploads` | Uploaded documents and avatars — outside the checkout so deploys never touch them |
| `covershift.service` (systemd) | uvicorn on `127.0.0.1:8000`, **one worker** (live chat keeps WebSocket rooms in memory), restarts on failure, starts at boot |
| `/etc/nginx/sites-available/covershift` | Port 80 → uvicorn, WebSocket upgrade, 12 MB upload limit |
| `~/deploy.sh` | Pull, install, migrate, restart, health-check |

Also on the server: 2 GB swap, certbot (with the Nginx plugin), automatic security updates.

## Day to day

**Log in to the server**

```bash
ssh -i ~/.ssh/covershift-key.pem ubuntu@65.1.38.162
```

SSH is only open to the office IP (EC2 → Security Groups → `launch-wizard-6` →
inbound SSH rule). If your IP changes, edit that rule's source to **My IP**.

**Deploy backend changes** — after pushing to `main`:

```bash
ssh -i ~/.ssh/covershift-key.pem ubuntu@65.1.38.162 '~/deploy.sh'
```

It stops at the first failure and prints the last log lines if the API does
not come back healthy.

**Frontend changes** deploy themselves: Amplify builds both apps on every push
to `main` using `amplify.yml` at the repo root.

**Logs**

```bash
sudo journalctl -u covershift -f          # API
sudo tail -f /var/log/nginx/error.log     # Nginx
```

**Restart the API**: `sudo systemctl restart covershift`

## Go-live: domain + HTTPS

Browsers block the `https://` admin site from calling an `http://` API, and
Android release builds block plain HTTP, so this is required before launch.

1. **DNS** (client's registrar or Route 53): add an `A` record `api` →
   `65.1.38.162`. Check it with `dig +short api.<domain>` — it must print the IP.
2. **Certificate** on the server (free, renews automatically):

   ```bash
   sudo sed -i 's/server_name _;/server_name api.<domain>;/' /etc/nginx/sites-available/covershift
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d api.<domain> --redirect -m <admin-email> --agree-tos -n
   ```

3. **Backend CORS** — in `~/covershift/backend/.env`, set `CORS_ORIGINS` to the
   admin site's address(es), then `sudo systemctl restart covershift`.
4. **Admin web** — Amplify → `covershift-admin` → Hosting → Environment
   variables: `VITE_API_URL=https://api.<domain>/api/v1` → redeploy the `main` branch.
5. **Mobile** — `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=https://api.<domain>/api/v1`,
   then build and release a new APK.
6. Optional custom domains for the web apps: Amplify → Hosting → Custom
   domains (e.g. `admin.<domain>`, `<domain>`). Add the new admin address to
   `CORS_ORIGINS`.

## After go-live

- Shut down the old Railway backend and Vercel projects.
- Delete the unused security group `ec2-rds-1` (left from a failed database
  attempt): EC2 → Instances → `covershift-backend` → Actions → Security →
  Change security groups → remove it; then EC2 → Security Groups → delete it.
- Root account: turn on MFA; prefer IAM users for day-to-day access.
- Change the super admin's temporary password (Profile → Change Password).

## Costs (approximate, per month)

EC2 t3.small ~$17 · RDS db.t4g.micro + 20 GB ~$16 · public IPv4 ~$3.6 ·
Amplify a few dollars. Never leave an Elastic IP unattached — it is billed.
