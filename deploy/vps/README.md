# Moving CoverShift from AWS to the MilesWeb VPS

Everything (API, MySQL, admin web, landing page, uploaded files) runs on one
Ubuntu 24.04 VPS. AWS keeps serving users until the DNS switch in step 6.

`AWS` = `ssh -i ~/.ssh/covershift-key.pem ubuntu@65.1.38.162`
`VPS` = `ssh ubuntu@<VPS_IP>` (after step 2)

## 1. Before the server is ready
- Ask the client to lower the TTL of the `api`, `app` and `www` records in
  GoDaddy from 1 hour to 600 seconds (10 min), so the switch spreads faster.
- Push this folder to `main` (the VPS clones the repo from GitHub).

## 2. Get in with an SSH key (once)
```
ssh-keygen -y -f ~/.ssh/covershift-key.pem > /tmp/covershift.pub
ssh-copy-id -f -i /tmp/covershift.pub root@<VPS_IP>     # type the root password from the MilesWeb email
ssh -i ~/.ssh/covershift-key.pem root@<VPS_IP> 'echo key login works'
```

## 3. Set up the server (~10 min)
```
ssh -i ~/.ssh/covershift-key.pem root@<VPS_IP> 'bash -s' < deploy/vps/setup_server.sh
```
After this, root/password login over SSH is off; use the `ubuntu` user with the key.

## 4. Copy the data and start the API
```
AWS 'bash -s' < deploy/vps/export_from_aws.sh
scp -i ~/.ssh/covershift-key.pem ubuntu@65.1.38.162:covershift-export.tar.gz /tmp/
scp -i ~/.ssh/covershift-key.pem /tmp/covershift-export.tar.gz ubuntu@<VPS_IP>:
rm /tmp/covershift-export.tar.gz
VPS 'bash -s' < deploy/vps/import_on_vps.sh
VPS 'bash -s' < deploy/vps/enable_sites.sh
```

## 5. Test on the VPS before switching
```
curl -H 'Host: api.covershift.in' http://<VPS_IP>/health
curl -s -H 'Host: app.covershift.in' http://<VPS_IP>/ | grep -o '<title>.*</title>'
curl -s -H 'Host: www.covershift.in' http://<VPS_IP>/ | grep -o '<title>.*</title>'
```

## 6. Switch (short downtime)
1. Final export with the AWS API stopped, so no data is lost:
   `AWS 'STOP_API=1 bash -s' < deploy/vps/export_from_aws.sh`, then the two
   `scp` lines and `import_on_vps.sh` from step 4.
2. Client changes in GoDaddy (delete the old CNAMEs for app/www first):

   | Type | Name | Value |
   |---|---|---|
   | A | api | `<VPS_IP>` |
   | A | app | `<VPS_IP>` |
   | A | www | `<VPS_IP>` |

   The root `covershift.in` keeps its GoDaddy forwarding to www (no change).
3. When `dig +short api.covershift.in @8.8.8.8` (and app, www) show the VPS IP:
   ```
   VPS 'sudo certbot --nginx -d api.covershift.in -d app.covershift.in -d www.covershift.in --redirect --agree-tos -m <email> -n'
   ```
4. Test: admin login, mobile app login, a document download, an avatar.

## 7. After 1–2 days of everything working: shut down AWS
Amplify apps (2), EC2 instance + its Elastic IP, RDS database (take a final
snapshot only if the client wants to keep one, it is billed), S3 bucket,
then check Billing shows nothing running.

## Day to day
- Deploy: `VPS '~/deploy.sh'` (or `~/deploy.sh backend` / `~/deploy.sh web`).
  Pushing to GitHub no longer deploys the websites by itself.
- DB backups: nightly at 02:00 into `~/backups`, last 7 days kept.
- Logs: `VPS 'sudo journalctl -u covershift -n 100 --no-pager'`
