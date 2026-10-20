# VPS deployment

One Node process (`dist/server/main.js`) per environment serves the SPA, the API, photos and PDFs; Caddy terminates TLS in front of it. Design and rationale: `docs/architecture.md` (Deployment, Monitoring, Backups).

Every script takes the environment as its first argument, `production` or `staging`; there is no default. Both can run on one VPS without sharing anything:

| | production | staging |
| --- | --- | --- |
| Port | 3000 | 3001 |
| Units, system user, Caddy site | `regenton-production*` | `regenton-staging*` |
| Directory | `/srv/regenton/production` | `/srv/regenton/staging` |
| Secrets on host | `/etc/regenton-production.env` | `/etc/regenton-staging.env` |
| Local config (gitignored) | `devops/deploy.production.env`, `devops/production.env` | `devops/deploy.staging.env`, `devops/staging.env` |
| Bucket prefix | `regenton-production/` | `regenton-staging/` |

Inside each environment's directory (`<dir>` below):

| Path on host | What | Touched by deploy? |
| --- | --- | --- |
| `<dir>/app` | `dist/`, `package.json`, `package-lock.json` | Replaced (rsync `--delete`, allow-list in `deploy.sh`) |
| `<dir>/app/node_modules` | Production deps | Reinstalled only when `package-lock.json` changed |
| `<dir>/browsers` | Playwright's Chromium for the PDFs | Same |
| `<dir>/data/app.db` | SQLite (WAL), replicated by Litestream. Migrations run on boot. | Never |
| `<dir>/data/fotos` | Photos, synced to the bucket by the daily backup check | Never |
| `<dir>/logs` | One gzipped file per day of every app and job log line (`zgrep` reads them), never pruned | Never |

## First time

Per environment (`<env>` = `production` or `staging`):

1. DNS: an A record for the domain pointing at the VPS.
2. The S3 bucket (EU): turn on versioning with a retention rule; that is the backup's protection against a bad delete. One bucket can serve both environments (each writes under its own prefix).
3. `cp devops/deploy.env.example devops/deploy.<env>.env` and fill in host and domain.
4. `bash devops/host-setup.sh <env>` (once per VPS), then `bash devops/provision.sh <env>`.
5. `cp devops/staging.env.example devops/<env>.env` (for production, drop `STAGING=1`), fill it in, then `bash devops/push-env.sh <env>`.
6. `bash devops/deploy.sh <env>`.
7. The first admin, run with the unit's user and env file (staging shown): `ssh <host> "systemd-run --pipe --wait --quiet -p User=regenton-staging -p WorkingDirectory=/srv/regenton/staging/app -p EnvironmentFile=/etc/regenton-staging.env -E APP_MODUS=production -E DATA_DIR=/srv/regenton/staging/data -E TZ=Europe/Amsterdam <NODE_BIN> dist/server/jobs.js beheerder 'Naam' naam@example.org"`. Everyone else is added in the app.
8. Once before launch: restore to a fresh VPS (host-setup, provision, push-env, then `litestream restore -config /etc/regenton-production-litestream.yml /srv/regenton/production/data/app.db` and `rclone copy` of `fotos/` before the first deploy) and write down what differed.

**Shared host** (one that already runs other apps behind one Caddy): skip `host-setup.sh` and step 2, and set `NODE_BIN` to its Node 26 and `BACKUPS=none` in `deploy.<env>.env`. `provision.sh` adds only `/etc/caddy/sites/regenton-<env>.caddy` and `/srv/registry/regenton-<env>.app`. Check that the port is still free in `/srv/registry/*.app`.

## Operate

- `bash devops/deploy.sh <env>`: ships the local working tree, committed or not, after typecheck, lint, unit tests and the build pass.
- `bash devops/status.sh <env>`: service, health, TLS, memory, errors, Litestream, backup check, digest and host at a glance.
- `bash devops/logs.sh <env>`: follows the app's and the jobs' journald logs. With more args (e.g. `--since "1 hour ago" -p warning`) it passes them to journalctl and prints once.
- `bash devops/restart.sh <env>`: restart without deploying. Sessions live in SQLite, so no one is logged out.
- `bash devops/push-env.sh <env>`: update secrets; restarts the app and Litestream.
- Run a job now: `ssh <host> systemctl start regenton-<env>-backup-check.service` (or `regenton-<env>-digest.service`).
