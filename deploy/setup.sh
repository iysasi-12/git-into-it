#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 VPS (written for Vultr Cloud Compute).
# Installs Node 22 + Caddy, clones the repo, builds it, and runs it under systemd
# behind Caddy with automatic HTTPS. Safe to re-run.
#
# Run as root on the server:
#   curl -fsSL https://raw.githubusercontent.com/iysasi-12/git-into-it/main/deploy/setup.sh | bash
#   curl -fsSL .../setup.sh | DOMAIN=planner.example.com bash      # with your own domain
#   curl -fsSL .../setup.sh | BRANCH=some-branch bash               # deploy another branch
#   curl -fsSL .../setup.sh | DEPLOY_PUBKEY='ssh-ed25519 AAAA...' bash  # allow GitHub Actions deploys
#
# With no DOMAIN, the site is served at https://<ip-with-dashes>.sslip.io (a free
# wildcard DNS name that resolves to the server's IP, so Caddy can get a real cert).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/iysasi-12/git-into-it.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/travel-planner
APP_USER=planner
SERVICE=travel-planner

[ "$(id -u)" -eq 0 ] || { echo "Run as root." >&2; exit 1; }

PUBLIC_IP="$(ip -4 route get 1.1.1.1 | awk '{for (i = 1; i < NF; i++) if ($i == "src") print $(i + 1)}')"
DOMAIN="${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}"
echo "==> Deploying $BRANCH to https://$DOMAIN"

export DEBIAN_FRONTEND=noninteractive

echo "==> Packages"
apt-get update -q
apt-get install -yq ca-certificates curl git caddy
if ! node -v 2>/dev/null | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -yq nodejs
fi

# The client build (tsc + vite) can run out of memory on a 1 GB plan without swap.
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && ! swapon --show | grep -q .; then
  echo "==> Adding 2 GB swap"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> App user and checkout"
id "$APP_USER" &>/dev/null || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

# Server config lives in the repo-root .env (server/src/config/env.ts reads ../.env).
# Starts in mock mode; see deploy/README.md to switch to live Aivana.
if [ ! -f "$APP_DIR/.env" ]; then
  cat > "$APP_DIR/.env" <<'EOF'
AIVANA_API_KEY=
AIVANA_BASE_URL=https://api.aivana.ai/v1
AIVANA_MOCK=true
EOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
fi

echo "==> systemd service"
cat > "/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Away-Game Travel Planner
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/server
Environment=NODE_ENV=production
Environment=PORT=3001
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "$SERVICE"

echo "==> Caddy (HTTPS reverse proxy)"
# Caddy's reverse_proxy has no response timeout by default, which matters here:
# live /api/recommend can take ~45 s.
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3001
}
EOF
systemctl reload-or-restart caddy

if ufw status 2>/dev/null | grep -q 'Status: active'; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

# GitHub Actions deploy key: it may only run update.sh (no shell, no forwarding).
if [ -n "${DEPLOY_PUBKEY:-}" ]; then
  echo "==> Authorizing GitHub Actions deploy key"
  install -m 700 -d /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  grep -qF "$DEPLOY_PUBKEY" /root/.ssh/authorized_keys ||
    echo "restrict,command=\"bash $APP_DIR/deploy/update.sh\" $DEPLOY_PUBKEY" >> /root/.ssh/authorized_keys
fi

# Build and start (same steps as every later update).
BRANCH="$BRANCH" bash "$APP_DIR/deploy/update.sh"

echo
echo "Done: https://$DOMAIN  (first HTTPS request may take a few seconds while Caddy gets the cert)"
echo "Logs: journalctl -u $SERVICE -f"
echo
echo "For GitHub Actions (see deploy/README.md):"
echo "  DEPLOY_HOST        = $PUBLIC_IP"
echo "  DEPLOY_URL         = https://$DOMAIN"
echo "  DEPLOY_KNOWN_HOSTS = $PUBLIC_IP $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
