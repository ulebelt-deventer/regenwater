#!/usr/bin/env bash
# Lists the proefomgevingen from the register, with per proefomgeving its users, dossiers and photos, and the addresses of dossiers the visitor added (made after the copy). Read-only. Staging only.
. "$(cd "$(dirname "$0")" && pwd)/config.sh"
require_host
[ "${ENVIRONMENT}" = staging ] || { echo "ERROR: proefomgevingen exist only on staging." >&2; exit 1; }

remote_sudo "env SERVICE_USER='${SERVICE_USER}' APP_DIR='${APP_DIR}' DATA_DIR='${DATA_DIR}' ENV_FILE='${ENV_FILE}' NODE_BIN='${NODE_BIN}' bash -s" <<'REMOTE'
set -euo pipefail
sjabloon="$(sed -n 's/^PROEF_SJABLOON=//p' "${ENV_FILE}")"
cd "${APP_DIR}"
# As the app's user: opening a WAL database can create its -wal and -shm files, and root-owned ones would lock the app out.
runuser -u "${SERVICE_USER}" -- "${NODE_BIN}" -e '
  const path = require("node:path");
  const Database = require("better-sqlite3");
  const [root, sjabloon] = process.argv.slice(1);
  const open = (p) => new Database(p, { readonly: true, fileMustExist: true });
  const tijd = (iso) => new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" }).slice(0, 16);
  const rijen = open(path.join(root, "register.db")).prepare("SELECT * FROM proefomgevingen ORDER BY created_at").all();
  const bezoekers = rijen.filter((r) => r.email.toLowerCase() !== sjabloon.toLowerCase()).length;
  console.log(`${rijen.length} proefomgevingen (${bezoekers} van bezoekers, sjabloon ${sjabloon || "niet ingesteld"})\n`);
  for (const r of rijen) {
    const db = open(path.join(root, r.id, "app.db"));
    const tel = (sql, ...p) => db.prepare(sql).pluck().get(...p);
    const nieuw = db.prepare("SELECT straat, huisnummer, huisletter, toevoeging, postcode, plaats FROM dossiers WHERE created_at > ? ORDER BY created_at").all(r.created_at);
    const merk = r.email.toLowerCase() === sjabloon.toLowerCase() ? "  [sjabloon]" : "";
    console.log(`${r.id}  ${r.naam} <${r.email}>${merk}`);
    console.log(`  aangemaakt ${tijd(r.created_at)}, laatst gebruikt ${tijd(r.laatst_gebruikt_at)}`);
    console.log(`  ${tel("SELECT count(*) FROM gebruikers WHERE archived_at IS NULL")} gebruikers, ${tel("SELECT count(*) FROM dossiers")} dossiers (${nieuw.length} nieuw), ${tel("SELECT count(*) FROM fotos")} fotos`);
    for (const d of nieuw) {
      const nummer = [d.huisnummer, d.huisletter, d.toevoeging && `-${d.toevoeging}`].filter(Boolean).join("");
      console.log(`    ${[[d.straat, nummer].filter(Boolean).join(" "), [d.postcode, d.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "(geen adres)"}`);
    }
    db.close();
  }
' "${DATA_DIR}/proef" "${sjabloon}"
REMOTE
