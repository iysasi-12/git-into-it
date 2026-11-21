#!/usr/bin/env bash
# Fetch, rebuild, and restart. Runs as root on the server, two ways:
#   - GitHub Actions: its SSH key is forced to run this script, and the commit SHA
#     it sends arrives in $SSH_ORIGINAL_COMMAND (see deploy/README.md).
#   - By hand: bash /opt/travel-planner/deploy/update.sh [commit-sha]
# With no SHA it deploys the tip of the branch.
set -euo pipefail

APP_DIR=/opt/travel-planner
APP_USER=planner
SERVICE=travel-planner
BRANCH="${BRANCH:-main}"
SHA="${1:-${SSH_ORIGINAL_COMMAND:-}}"

if [ -n "$SHA" ] && ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character commit SHA, got: $SHA" >&2
  exit 2
fi

as_app() { sudo -u "$APP_USER" -H bash -c "cd '$APP_DIR' && $1"; }

echo "==> Fetching $BRANCH"
as_app "git fetch --quiet origin '$BRANCH'"
TARGET="${SHA:-origin/$BRANCH}"
# Only deploy commits that are actually on the branch.
if ! as_app "git merge-base --is-ancestor '$TARGET' 'origin/$BRANCH'"; then
  echo "$TARGET is not on origin/$BRANCH; refusing to deploy." >&2
  exit 1
fi
as_app "git checkout --quiet --force -B '$BRANCH' '$TARGET'"

echo "==> Installing and building $(as_app 'git log -1 --oneline')"
as_app "npm ci --no-audit --no-fund && npm run build"

echo "==> Restarting"
systemctl restart "$SERVICE"
for _ in $(seq 1 20); do
  if curl -fsS -o /dev/null http://127.0.0.1:3001/api/opponents; then
    echo "OK: deployed $(as_app 'git log -1 --oneline')"
    exit 0
  fi
  sleep 1
done
echo "Service did not come up. Recent logs:" >&2
journalctl -u "$SERVICE" -n 30 --no-pager >&2
exit 1
