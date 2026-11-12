#!/usr/bin/env bash
# Download the live data to backups/<env>-<timestamp>/, laid out like data/ (app.db and fotos/), and check that the database is intact and every photo it lists is present.
. "$(cd "$(dirname "$0")" && pwd)/config.sh"
require_host
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "${REPO_ROOT}/backups"
OUT="${REPO_ROOT}/backups/${ENVIRONMENT}-$(date +%Y%m%d-%H%M%S)"
# Built under .partial and renamed at the end, so a folder without the suffix is always complete.
mkdir "${OUT}.partial"

echo "==> Snapshot ${DEPLOY_HOST}:${DATA_DIR}/app.db"
# SQLite's online backup API, run as the app's user so the WAL files keep their owner; copying app.db itself could catch a write halfway.
remote_sudo "env SERVICE_USER='${SERVICE_USER}' APP_DIR='${APP_DIR}' DATA_DIR='${DATA_DIR}' NODE_BIN='${NODE_BIN}' bash -s" > "${OUT}.partial/app.db.gz" <<'REMOTE'
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
gunzip "${OUT}.partial/app.db.gz"

# After the snapshot, so every photo the snapshot lists already exists on the host. Photos are written once under a new id, so a plain copy is consistent.
echo "==> Photos ${DEPLOY_HOST}:${DATA_DIR}/fotos"
if [ "${DEPLOY_USER}" = root ]; then RSYNC_PATH=rsync; else RSYNC_PATH="sudo rsync"; fi
rsync -rtz --rsync-path="${RSYNC_PATH}" -e "ssh -p ${SSH_PORT}" \
  "${DEPLOY_USER}@${DEPLOY_HOST}:${DATA_DIR}/fotos/" "${OUT}.partial/fotos/"

echo "==> Integrity check"
( cd "${REPO_ROOT}" && node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const Database = require("better-sqlite3");
  const [dbPad, fotoDir] = process.argv.slice(1);
  const db = new Database(dbPad, { fileMustExist: true });
  // The copy inherits WAL mode, which leaves -wal and -shm files next to it; DELETE mode makes it a single file.
  db.pragma("journal_mode = DELETE");
  const ok = db.pragma("integrity_check", { simple: true });
  if (ok !== "ok") { console.error("integrity_check: " + ok); process.exit(1); }
  // The app deletes a photo file only after its row, so a missing file means the copy is incomplete. A rotation or dossier delete during the run can cause this too; run again.
  const ids = db.prepare("SELECT id FROM fotos").pluck().all();
  const ontbreekt = ids.filter((id) => !fs.existsSync(path.join(fotoDir, id + ".jpg")));
  if (ontbreekt.length > 0) { console.error(ontbreekt.length + " of " + ids.length + " photos missing, e.g. " + ontbreekt.slice(0, 5).join(", ")); process.exit(1); }
  console.log("schema version " + db.pragma("user_version", { simple: true }) + ", newest audit event " + db.prepare("SELECT max(created_at) FROM audit").pluck().get() + ", " + ids.length + " photos");
' "${OUT}.partial/app.db" "${OUT}.partial/fotos" )
mv "${OUT}.partial" "${OUT}"
echo "==> Saved ${OUT} ($(du -sh "${OUT}" | cut -f1))"
