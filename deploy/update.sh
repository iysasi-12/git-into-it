#!/usr/bin/env bash
# Fetch, rebuild, and restart. Runs as root on the server, two ways:
#   - GitHub Actions: its SSH key is forced to run this script, and the commit SHA
#     it sends arrives in $SSH_ORIGINAL_COMMAND (see deploy/README.md).
#   - By hand: bash /opt/travel-planner/deploy/update.sh [commit-sha]
# With no SHA it deploys the tip of the branch. If the build or the health check
# fails, it goes back to the commit that was running before and exits non-zero.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/travel-planner}"
APP_USER="${APP_USER:-planner}"
SERVICE=travel-planner
BRANCH="${BRANCH:-main}"
LOCK_FILE="${LOCK_FILE:-/run/lock/$SERVICE-deploy.lock}"
SHA="${1:-${SSH_ORIGINAL_COMMAND:-}}"

if [ -n "$SHA" ] && ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character commit SHA, got: $SHA" >&2
  exit 2
fi

# One deploy at a time. GitHub's concurrency group only covers Actions runs,
# not someone running this by hand at the same moment.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "==> Another deploy is running; waiting for it to finish"
  flock -w 900 9 || { echo "Gave up after 15 min waiting for the deploy lock." >&2; exit 1; }
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
PREV="$(as_app 'git rev-parse HEAD')"

# Check out, build, restart, health-check. Returns non-zero on any failure.
# (set -e doesn't apply inside a function called from `if`, hence the explicit returns.)
build_and_start() {
  as_app "git checkout --quiet --force -B '$BRANCH' '$1'" || return 1
  echo "==> Installing and building $(as_app 'git log -1 --oneline')"
  as_app "npm ci --no-audit --no-fund && npm run build" || return 1
  echo "==> Restarting"
  systemctl restart "$SERVICE" || return 1
  for _ in $(seq 1 20); do
    curl -fs -o /dev/null http://127.0.0.1:3001/api/opponents && return 0
    sleep 1
  done
  echo "Service did not come up. Recent logs:" >&2
  journalctl -u "$SERVICE" -n 30 --no-pager >&2
  return 1
}

if build_and_start "$TARGET"; then
  echo "OK: deployed $(as_app 'git log -1 --oneline')"
  exit 0
fi

echo "!! Deploy of $TARGET failed. Rolling back to $PREV" >&2
if build_and_start "$PREV"; then
  echo "Rolled back; still serving $(as_app 'git log -1 --oneline')" >&2
else
  echo "!! Rollback failed too. Check: systemctl status $SERVICE" >&2
fi
exit 1
