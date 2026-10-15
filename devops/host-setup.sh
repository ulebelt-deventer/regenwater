#!/usr/bin/env bash
# Once per VPS: packages, Node, Caddy, Litestream, rclone, firewall, swap, timezone. The VPS runs only this app (one or both environments); either environment's argument picks the host.
. "$(cd "$(dirname "$0")" && pwd)/config.sh"
require_host
remote_sudo "env NODE_MAJOR='${NODE_MAJOR}' SSH_PORT='${SSH_PORT}' bash -s" <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y rsync curl ca-certificates gnupg ufw fail2ban unattended-upgrades rclone
systemctl enable --now fail2ban
systemctl enable --now unattended-upgrades
timedatectl set-timezone Europe/Amsterdam

ufw allow "${SSH_PORT}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" != "${NODE_MAJOR}" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi
# provision.sh drops the site into /etc/caddy/sites. This replaces the package's welcome-page Caddyfile, so never run host-setup.sh on a shared host.
printf '%s\n' 'import /etc/caddy/sites/*.caddy' > /etc/caddy/Caddyfile
systemctl enable --now caddy

if ! command -v litestream >/dev/null 2>&1; then
  [ "$(uname -m)" = x86_64 ] || { echo "ERROR: expected x86_64, got $(uname -m)" >&2; exit 1; }
  deb_url="$(curl -fsSL https://api.github.com/repos/benbjohnson/litestream/releases/latest | grep -oE 'https://[^"]+linux-(amd64|x86_64)\.deb' | head -1)"
  [ -n "${deb_url}" ] || { echo "ERROR: no Litestream .deb found in the latest release" >&2; exit 1; }
  curl -fsSL -o /tmp/litestream.deb "${deb_url}"
  apt-get install -y /tmp/litestream.deb
  rm /tmp/litestream.deb
  # The package's own unit reads /etc/litestream.yml as root; provision.sh installs one that runs as the app user instead.
  systemctl disable --now litestream.service 2>/dev/null || true
fi

echo "Node $(node -v), $(caddy version | cut -d' ' -f1), Litestream $(litestream version), $(rclone version | head -1)"
echo '==> Host ready. Next: devops/provision.sh'
REMOTE
