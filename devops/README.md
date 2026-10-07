# VPS deployment

One Node process (`dist/server/main.js`) serves the SPA, the API, photos and PDFs on `127.0.0.1:3000`; Caddy terminates TLS in front of it. Design and rationale: `docs/architecture.md` (Deployment, Monitoring, Backups).

| Path on host | What | Touched by deploy? |
| --- | --- | --- |
| `/srv/regenton/app` | `dist/`, `package.json`, `package-lock.json` | Replaced (rsync `--delete`, allow-list in `deploy.sh`) |
| `/srv/regenton/app/node_modules` | Production deps | Reinstalled only when `package-lock.json` changed |
| `/srv/regenton/browsers` | Playwright's Chromium for the PDFs | Same |
| `/srv/regenton/data/app.db` | SQLite (WAL), replicated by Litestream. Migrations run on boot. | Never |
| `/srv/regenton/data/fotos` | Photos, synced to the bucket by the daily backup check | Never |
| `/srv/regenton/logs` | One file per day of warnings and errors, never pruned | Never |
| `/etc/regenton.env` | Secrets from `devops/production.env`, mode 640 root:regenton | Only by `push-env.sh` |

## First time

1. DNS: an A record for the domain pointing at the VPS.
2. The S3 bucket (EU): turn on versioning with a retention rule; that is the backup's protection against a bad delete.
3. `cp devops/deploy.env.example devops/deploy.env` and fill in host and domain.
4. `bash devops/host-setup.sh`, then `bash devops/provision.sh`.
5. `cp devops/production.env.example devops/production.env`, fill it in, then `bash devops/push-env.sh`.
6. `bash devops/deploy.sh`.
7. The first admin: `ssh <host> "cd /srv/regenton/app && sudo -u regenton env \$(sudo cat /etc/regenton.env | xargs) APP_MODUS=production DATA_DIR=/srv/regenton/data node dist/server/jobs.js beheerder 'Naam' naam@example.org"`. Everyone else is added in the app.
8. Once before launch: restore to a fresh VPS (host-setup, provision, push-env, then `litestream restore -config /etc/regenton-litestream.yml /srv/regenton/data/app.db` and `rclone copy` of `fotos/` before the first deploy) and write down what differed.

## Operate

- `bash devops/deploy.sh`: ships the local working tree, committed or not, after typecheck, lint, unit tests and the build pass.
- `bash devops/status.sh`: service, health, TLS, memory, errors, Litestream, backup check, digest and host at a glance.
- `bash devops/logs.sh`: follows the app's and the jobs' journald logs. With args (e.g. `--since "1 hour ago" -p warning`) it passes them to journalctl and prints once.
- `bash devops/restart.sh`: restart without deploying. Sessions live in SQLite, so no one is logged out.
- `bash devops/push-env.sh`: update secrets; restarts the app and Litestream.
- Run a job now: `ssh <host> systemctl start regenton-backup-check.service` (or `regenton-digest.service`).
