#!/usr/bin/env bash
# Upload devops/<env>.env (gitignored) to the host's ENV_FILE, readable only by root and the app user.
. "$(cd "$(dirname "$0")" && pwd)/config.sh"
require_host
SRC="${_config_dir}/${ENVIRONMENT}.env"
[ -f "${SRC}" ] || { echo "ERROR: ${SRC} not found. Copy staging.env.example and fill it in." >&2; exit 1; }
required="BASIS_URL MAILGUN_API_KEY MAILGUN_DOMEIN MAIL_AFZENDER MELDINGEN_DIGEST MELDINGEN_FEEDBACK MELDINGEN_DOSSIER"
if [ "${BACKUPS}" = s3 ]; then required="${required} S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY"; fi
for var in ${required}; do
  grep -Eq "^${var}=.+" "${SRC}" || { echo "ERROR: ${var} is empty in ${SRC}." >&2; exit 1; }
done
if grep -Eq '^(APP_MODUS|HOST|PORT|DATA_DIR|TZ|PLAYWRIGHT_BROWSERS_PATH)=' "${SRC}"; then
  echo "ERROR: ${SRC} sets a var the systemd units own." >&2; exit 1
fi
remote_sudo "umask 077 && cat > '${ENV_FILE}.new' && chown root:'${SERVICE_USER}' '${ENV_FILE}.new' && chmod 640 '${ENV_FILE}.new' && mv '${ENV_FILE}.new' '${ENV_FILE}'" < "${SRC}"
echo "==> Wrote ${ENV_FILE} on ${DEPLOY_HOST}"
# try-restart restarts only a running unit; a stopped one reads the new file when it next starts.
for unit in "${SERVICE_NAME}.service" $([ "${BACKUPS}" = s3 ] && echo "${SERVICE_NAME}-litestream.service"); do
  remote_sudo systemctl try-restart "${unit}"
  state="$(remote_sudo systemctl is-active "${unit}" || true)"
  if [ "${state}" = active ]; then echo "==> Restarted ${unit} with the new env"; else echo "==> ${unit} is ${state}, so it was not restarted; it reads the new env when it next starts"; fi
done
