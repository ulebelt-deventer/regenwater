#!/usr/bin/env bash
# Download a consistent snapshot of the live database to backups/<env>-<timestamp>.db and check its integrity. Photos are not included.
. "$(cd "$(dirname "$0")" && pwd)/config.sh"
require_host
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "${REPO_ROOT}/backups"
OUT="${REPO_ROOT}/backups/${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S).db"

echo "==> Snapshot ${DEPLOY_HOST}:${DATA_DIR}/app.db"
# SQLite's online backup API, run as the app's user so the WAL files keep their owner; copying app.db itself could catch a write halfway.
remote_sudo "env SERVICE_USER='${SERVICE_USER}' APP_DIR='${APP_DIR}' DATA_DIR='${DATA_DIR}' NODE_BIN='${NODE_BIN}' bash -s" > "${OUT}.gz.partial" <<'REMOTE'
set -euo pipefail
tmp="$(runuser -u "${SERVICE_USER}" -- mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
cd "${APP_DIR}"
runuser -u "${SERVICE_USER}" -- "${NODE_BIN}" -e '
  const Database = require("better-sqlite3");
  new Database(process.argv[1], { readonly: true, fileMustExist: true }).backup(process.argv[2])
    .catch((e) => { console.error(e); process.exit(1); });
' "${DATA_DIR}/app.db" "${tmp}/app.db" >&2
gzip -c "${tmp}/app.db"
REMOTE
gunzip -c "${OUT}.gz.partial" > "${OUT}.partial"
rm "${OUT}.gz.partial"

echo "==> Integrity check"
( cd "${REPO_ROOT}" && node -e '
  const Database = require("better-sqlite3");
  const db = new Database(process.argv[1], { fileMustExist: true });
  // The copy inherits WAL mode, which leaves -wal and -shm files next to it; DELETE mode makes it a single file.
  db.pragma("journal_mode = DELETE");
  const ok = db.pragma("integrity_check", { simple: true });
  if (ok !== "ok") { console.error("integrity_check: " + ok); process.exit(1); }
  console.log("schema version " + db.pragma("user_version", { simple: true }) + ", newest audit event " + db.prepare("SELECT max(created_at) FROM audit").pluck().get());
' "${OUT}.partial" )
mv "${OUT}.partial" "${OUT}"
echo "==> Saved ${OUT} ($(du -h "${OUT}" | cut -f1))"
