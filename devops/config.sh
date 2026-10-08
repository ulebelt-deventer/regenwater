#!/usr/bin/env bash
# Shared configuration for the VPS scripts. Values come from devops/deploy.env (gitignored) or the environment.
set -euo pipefail
_config_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${_config_dir}/deploy.env" ]; then . "${_config_dir}/deploy.env"; fi

DEPLOY_HOST="${DEPLOY_HOST:-}"
DEPLOY_USER="${DEPLOY_USER:-root}"
SSH_PORT="${SSH_PORT:-22}"
DOMAIN="${DOMAIN:-}"
SERVICE_NAME=regenton
SERVICE_USER=regenton
APP_PORT=3000
NODE_MAJOR=26
# The Node the units and npm run. A shared host whose system Node is older points this at a private install.
NODE_BIN="${NODE_BIN:-/usr/bin/node}"
# s3: Litestream, the photo sync and the daily backup check. none: no backups, for a throwaway prototype host.
BACKUPS="${BACKUPS:-s3}"
case "${BACKUPS}" in s3|none) ;; *) echo "ERROR: BACKUPS must be s3 or none, got '${BACKUPS}'." >&2; exit 1 ;; esac
REMOTE_DIR="/srv/${SERVICE_NAME}"
# Code is replaced on every deploy; data/ (SQLite and data/fotos) is never touched by rsync.
APP_DIR="${REMOTE_DIR}/app"
DATA_DIR="${REMOTE_DIR}/data"
# Playwright's Chromium for the PDFs, outside app/ so rsync --delete leaves it alone.
BROWSERS_DIR="${REMOTE_DIR}/browsers"
# Daily warning-and-error archive, one file per day, never pruned (journald is size-capped).
LOG_DIR="${REMOTE_DIR}/logs"
# Secrets (Mailgun, Healthchecks, S3) live only here on the host; push-env.sh writes it.
ENV_FILE="/etc/${SERVICE_NAME}.env"

require_host() {
  if [ -z "${DEPLOY_HOST}" ] || [ -z "${DOMAIN}" ]; then echo "ERROR: DEPLOY_HOST and DOMAIN must be set in devops/deploy.env." >&2; exit 1; fi
}
remote() { ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "$@"; }
remote_sudo() {
  if [ "${DEPLOY_USER}" = root ]; then ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "$@";
  else ssh -p "${SSH_PORT}" "${DEPLOY_USER}@${DEPLOY_HOST}" "sudo $*"; fi
}
