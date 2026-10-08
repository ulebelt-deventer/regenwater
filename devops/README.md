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
7. The first admin, run with the unit's user and env file: `ssh <host> "systemd-run --pipe --wait --quiet -p User=regenton -p WorkingDirectory=/srv/regenton/app -p EnvironmentFile=/etc/regenton.env -E APP_MODUS=production -E DATA_DIR=/srv/regenton/data -E TZ=Europe/Amsterdam <NODE_BIN> dist/server/jobs.js beheerder 'Naam' naam@example.org"`. Everyone else is added in the app.
8. Once before launch: restore to a fresh VPS (host-setup, provision, push-env, then `litestream restore -config /etc/regenton-litestream.yml /srv/regenton/data/app.db` and `rclone copy` of `fotos/` before the first deploy) and write down what differed.

**Shared host** (the prototype on racknerd1, which already runs other apps behind one Caddy): skip `host-setup.sh` and step 2, and set `NODE_BIN=/opt/node26/bin/node` and `BACKUPS=none` in `deploy.env`. `provision.sh` adds only `/etc/caddy/sites/regenton.caddy` and `/srv/registry/regenton.app`. Check that port 3000 is still free in `/srv/registry/*.app`.

## Operate

- `bash devops/deploy.sh`: ships the local working tree, committed or not, after typecheck, lint, unit tests and the build pass.
- `bash devops/status.sh`: service, health, TLS, memory, errors, Litestream, backup check, digest and host at a glance.
- `bash devops/logs.sh`: follows the app's and the jobs' journald logs. With args (e.g. `--since "1 hour ago" -p warning`) it passes them to journalctl and prints once.
- `bash devops/restart.sh`: restart without deploying. Sessions live in SQLite, so no one is logged out.
- `bash devops/push-env.sh`: update secrets; restarts the app and Litestream.
- Run a job now: `ssh <host> systemctl start regenton-backup-check.service` (or `regenton-digest.service`).
