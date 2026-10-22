#!/usr/bin/env bash
# Idempotent; rerun whenever the units change. System user, directories, the app service, the digest and log-archive timers, Litestream and the backup-check timer (BACKUPS=s3), the Caddy site in /etc/caddy/sites, and the host's app registry if it has one.
. "$(cd "$(dirname "$0")" && pwd)/config.sh"
require_host
echo "==> Provisioning ${SERVICE_NAME}: ${DOMAIN} -> 127.0.0.1:${APP_PORT}, ${REMOTE_DIR}"
remote_sudo "env SERVICE_NAME='${SERVICE_NAME}' SERVICE_USER='${SERVICE_USER}' DOMAIN='${DOMAIN}' APP_PORT='${APP_PORT}' REMOTE_DIR='${REMOTE_DIR}' APP_DIR='${APP_DIR}' DATA_DIR='${DATA_DIR}' BROWSERS_DIR='${BROWSERS_DIR}' LOG_DIR='${LOG_DIR}' ENV_FILE='${ENV_FILE}' NODE_BIN='${NODE_BIN}' BACKUPS='${BACKUPS}' bash -s" <<'REMOTE'
set -euo pipefail
"${NODE_BIN}" -v >/dev/null || { echo "ERROR: NODE_BIN ${NODE_BIN} does not run" >&2; exit 1; }
grep -Fq 'import /etc/caddy/sites/*.caddy' /etc/caddy/Caddyfile || { echo "ERROR: /etc/caddy/Caddyfile does not import /etc/caddy/sites/*.caddy; run host-setup.sh" >&2; exit 1; }
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  adduser --system --group --home "${REMOTE_DIR}" --no-create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
fi
install -d -m 755 "${REMOTE_DIR}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 755 "${APP_DIR}" "${BROWSERS_DIR}"
install -d -o "${SERVICE_USER}" -g "${SERVICE_USER}" -m 750 "${DATA_DIR}"
install -d -m 750 "${LOG_DIR}"

# Shared by every unit that runs app code, so the jobs see exactly what the server sees.
APP_ENV="EnvironmentFile=${ENV_FILE}
Environment=APP_MODUS=production
Environment=HOST=127.0.0.1
Environment=PORT=${APP_PORT}
Environment=DATA_DIR=${DATA_DIR}
Environment=TZ=Europe/Amsterdam
Environment=PLAYWRIGHT_BROWSERS_PATH=${BROWSERS_DIR}"
HARDENING="NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<UNIT
[Unit]
Description=${SERVICE_NAME} (Ulebelt regenton: API, SPA and PDFs)
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
# Required: the unit refuses to start until push-env.sh has written it.
${APP_ENV}
ExecStart=${NODE_BIN} dist/server/main.js
Restart=on-failure
RestartSec=2
${HARDENING}
# Node plus the headless Chromium that prints the PDFs (200-500 MB per render, one at a time).
MemoryMax=1200M

[Install]
WantedBy=multi-user.target
UNIT

if [ "${BACKUPS}" = s3 ]; then
cat > "/etc/${SERVICE_NAME}-litestream.yml" <<YML
# Litestream expands the \$S3_* variables from ${ENV_FILE}.
dbs:
  - path: ${DATA_DIR}/app.db
    replicas:
      - type: s3
        endpoint: \${S3_ENDPOINT}
        region: \${S3_REGION}
        bucket: \${S3_BUCKET}
        path: ${SERVICE_NAME}/db
        access-key-id: \${S3_ACCESS_KEY_ID}
        secret-access-key: \${S3_SECRET_ACCESS_KEY}
YML
cat > "/etc/systemd/system/${SERVICE_NAME}-litestream.service" <<UNIT
[Unit]
Description=${SERVICE_NAME} SQLite replication to S3 (Litestream)
After=network-online.target ${SERVICE_NAME}.service
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/litestream replicate -config /etc/${SERVICE_NAME}-litestream.yml
Restart=always
RestartSec=5
${HARDENING}

[Install]
WantedBy=multi-user.target
UNIT
fi

cat > "/etc/systemd/system/${SERVICE_NAME}-digest.service" <<UNIT
[Unit]
Description=${SERVICE_NAME} weekly digest to the admins

[Service]
Type=oneshot
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
${APP_ENV}
ExecStart=${NODE_BIN} dist/server/jobs.js digest
${HARDENING}
UNIT
cat > "/etc/systemd/system/${SERVICE_NAME}-digest.timer" <<UNIT
[Unit]
Description=Weekly ${SERVICE_NAME} digest

[Timer]
OnCalendar=Mon 08:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

if [ "${BACKUPS}" = s3 ]; then
# Proves the backup works: syncs the photos, restores the latest replica and checks it against the live database. Pings Healthchecks check 2 either way.
install -m 755 /dev/stdin "/usr/local/sbin/${SERVICE_NAME}-backup-check" <<SCRIPT
#!/bin/bash
set -uo pipefail
ping() { [ -z "\${BACKUP_HEALTHCHECK_URL:-}" ] || curl -fsS -m 10 --retry 3 -X POST "\${BACKUP_HEALTHCHECK_URL}\$1" >/dev/null || echo "healthcheck ping mislukt" >&2; }
export RCLONE_CONFIG_BACKUP_TYPE=s3 RCLONE_CONFIG_BACKUP_PROVIDER=Other
export RCLONE_CONFIG_BACKUP_ENDPOINT="\${S3_ENDPOINT}" RCLONE_CONFIG_BACKUP_REGION="\${S3_REGION}"
export RCLONE_CONFIG_BACKUP_ACCESS_KEY_ID="\${S3_ACCESS_KEY_ID}" RCLONE_CONFIG_BACKUP_SECRET_ACCESS_KEY="\${S3_SECRET_ACCESS_KEY}"
tmp="\$(mktemp -d)"
trap 'rm -rf "\${tmp}"' EXIT
if rclone sync "${DATA_DIR}/fotos" "backup:\${S3_BUCKET}/${SERVICE_NAME}/fotos" \\
  && litestream restore -config "/etc/${SERVICE_NAME}-litestream.yml" -o "\${tmp}/app.db" "${DATA_DIR}/app.db" \\
  && "${NODE_BIN}" dist/server/jobs.js backupcheck "\${tmp}/app.db"; then
  ping ""
else
  ping /fail
  exit 1
fi
SCRIPT
cat > "/etc/systemd/system/${SERVICE_NAME}-backup-check.service" <<UNIT
[Unit]
Description=${SERVICE_NAME} photo sync and backup restore check

[Service]
Type=oneshot
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
${APP_ENV}
ExecStart=/usr/local/sbin/${SERVICE_NAME}-backup-check
${HARDENING}
UNIT
cat > "/etc/systemd/system/${SERVICE_NAME}-backup-check.timer" <<UNIT
[Unit]
Description=Daily ${SERVICE_NAME} backup check

[Timer]
OnCalendar=*-*-* 04:00:00
RandomizedDelaySec=30m
Persistent=true

[Install]
WantedBy=timers.target
UNIT
fi

# journald is size-capped, so the app's and jobs' log lines (the request log included) are copied out daily into gzipped files, deleted after 12 months like journald's own (host-setup.sh).
install -m 755 /dev/stdin "/usr/local/sbin/${SERVICE_NAME}-archive-logs" <<'SCRIPT'
#!/bin/sh
# Usage: archive-logs <service> <dir>. Writes <dir>/YYYY-MM-DD.log.gz (every line, app and jobs) for each of the last 7 days that has no file yet, and deletes the files for days more than 12 months ago.
set -eu
service="$1"; dir="$2"
for n in 7 6 5 4 3 2 1; do
  day="$(date -d "${n} days ago" +%F)"
  [ -e "${dir}/${day}.log.gz" ] && continue
  journalctl -q -u "${service}*" -o short-iso --no-pager \
    --since "@$(date -d "${day}" +%s)" --until "@$(date -d "${day} + 1 day" +%s)" > "${dir}/${day}.log.tmp"
  gzip -n -f "${dir}/${day}.log.tmp"
  mv "${dir}/${day}.log.tmp.gz" "${dir}/${day}.log.gz"
done
# By the day a file holds (its name as YYYYMMDD), not when it was written.
oudste="$(date -d '12 months ago' +%Y%m%d)"
for f in "${dir}"/*.log.gz; do
  [ -e "${f}" ] || continue
  if [ "$(basename "${f}" .log.gz | tr -d -)" -lt "${oudste}" ]; then rm "${f}"; fi
done
SCRIPT
cat > "/etc/systemd/system/${SERVICE_NAME}-archive-logs.service" <<UNIT
[Unit]
Description=${SERVICE_NAME} log archive

[Service]
Type=oneshot
UMask=0077
ExecStart=/usr/local/sbin/${SERVICE_NAME}-archive-logs ${SERVICE_NAME} ${LOG_DIR}
UNIT
cat > "/etc/systemd/system/${SERVICE_NAME}-archive-logs.timer" <<UNIT
[Unit]
Description=Daily ${SERVICE_NAME} log archive

[Timer]
OnCalendar=*-*-* 00:10:00
Persistent=true

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service"
systemctl enable --now "${SERVICE_NAME}-digest.timer" "${SERVICE_NAME}-archive-logs.timer"
if [ "${BACKUPS}" = s3 ]; then
  systemctl enable "${SERVICE_NAME}-litestream.service"
  systemctl enable --now "${SERVICE_NAME}-backup-check.timer"
fi

install -d -m 755 /etc/caddy/sites
cat > "/etc/caddy/sites/${SERVICE_NAME}.caddy" <<CADDY
# Written by devops/provision.sh. One Node process serves the SPA, API, photos and PDFs.
${DOMAIN} {
	encode zstd gzip
	# Hold requests while the app restarts instead of returning 502.
	reverse_proxy 127.0.0.1:${APP_PORT} {
		lb_try_duration 30s
		lb_try_interval 250ms
	}
}
CADDY
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
# Shared hosts keep a registry of their apps (see /srv/README.md there).
if [ -d /srv/registry ]; then
  printf '%s\n' "# ${SERVICE_NAME} -- registered by provision.sh. Discover all apps with: cat /srv/registry/*.app" \
    "SERVICE_NAME=${SERVICE_NAME}" "DOMAIN=${DOMAIN}" "APP_PORT=${APP_PORT}" "SERVICE_USER=${SERVICE_USER}" "REMOTE_DIR=${REMOTE_DIR}" \
    "UNIT=${SERVICE_NAME}.service" "CADDY_SITE=/etc/caddy/sites/${SERVICE_NAME}.caddy" "ENV_FILE=${ENV_FILE}" "DATABASE=${DATA_DIR}/app.db" \
    "BACKUPS=${BACKUPS}" "NODE=${NODE_BIN}" "PROVISIONED=$(date -u +%FT%TZ)" > "/srv/registry/${SERVICE_NAME}.app"
fi
echo "==> Provisioned. Next: devops/push-env.sh, then devops/deploy.sh"
REMOTE
