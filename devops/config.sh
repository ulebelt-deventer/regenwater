#!/usr/bin/env bash
# Shared configuration for the VPS scripts. Every script takes the environment as its first argument (production or staging); this file shifts it off, so the script sees only the rest.
# Host and domain come from devops/deploy.<env>.env (gitignored); push-env.sh uploads the secrets in devops/<env>.env.
set -euo pipefail
_config_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENVIRONMENT="${1:-}"
# Both environments can share one host, so everything on it is namespaced by environment: port, unit, user, directories, env file, Caddy site.
case "${ENVIRONMENT}" in
  production) APP_PORT=3000 ;;
  staging) APP_PORT=3001 ;;
  *) echo "ERROR: first argument must be production or staging, got '${ENVIRONMENT}'. Usage: bash $0 <production|staging>" >&2; exit 1 ;;
esac
shift
DEPLOY_ENV="${_config_dir}/deploy.${ENVIRONMENT}.env"
[ -f "${DEPLOY_ENV}" ] || { echo "ERROR: ${DEPLOY_ENV} not found. Copy deploy.env.example and fill it in." >&2; exit 1; }
. "${DEPLOY_ENV}"

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
DOMAIN="${DOMAIN:-}"
SERVICE_NAME="regenton-${ENVIRONMENT}"
SERVICE_USER="${SERVICE_NAME}"
NODE_MAJOR=26
# The Node the units and npm run. A shared host whose system Node is older points this at a private install.
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
# s3: Litestream, the photo sync and the daily backup check. none: no backups, for a throwaway prototype host.
BACKUPS="${BACKUPS:-s3}"
case "${BACKUPS}" in s3|none) ;; *) echo "ERROR: BACKUPS must be s3 or none, got '${BACKUPS}'." >&2; exit 1 ;; esac
REMOTE_DIR="/srv/regenton/${ENVIRONMENT}"
# Code is replaced on every deploy; data/ (SQLite and data/fotos) is never touched by rsync.
APP_DIR="${REMOTE_DIR}/app"
DATA_DIR="${REMOTE_DIR}/data"
# Playwright's Chromium for the PDFs, outside app/ so rsync --delete leaves it alone.
BROWSERS_DIR="${REMOTE_DIR}/browsers"
# Daily log archive, one file per day, deleted after 12 months (journald is size-capped).
LOG_DIR="${REMOTE_DIR}/logs"
# Secrets (Mailgun, Healthchecks, S3) live only here on the host; push-env.sh writes it.
ENV_FILE="/etc/${SERVICE_NAME}.env"

require_host() {
  if [ -z "${DEPLOY_HOST}" ] || [ -z "${DOMAIN}" ]; then echo "ERROR: DEPLOY_HOST and DOMAIN must be set in ${DEPLOY_ENV}." >&2; exit 1; fi
}
remote() { ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "$@"; }
remote_sudo() {
  if [ "${DEPLOY_USER}" = root ]; then ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "$@";
  else ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "sudo $*"; fi
}
