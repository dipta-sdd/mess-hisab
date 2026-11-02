#!/usr/bin/env bash
# Every few minutes (user's crontab): if origin/main moved, reset the checkout to it and run deploy.sh.
# Installed as a copy outside the checkout, because `git reset` must not rewrite the script that is running.
set -euo pipefail
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

BASE="/home/user/web/mess-api.biponon.shop/private"
REPO_DIR="$BASE/repo"
LOG_DIR="$BASE/deploy-logs"
POLL_LOG="$LOG_DIR/poll.log"
mkdir -p "$LOG_DIR"

exec 200>"$BASE/deploy.lock"
if ! flock -n 200; then
  echo "$(date -Is)  already running, skipping" >> "$POLL_LOG"
  exit 0
fi

cd "$REPO_DIR"
git fetch origin main --quiet
local_head="$(git rev-parse HEAD)"
remote_head="$(git rev-parse origin/main)"
[ "$local_head" = "$remote_head" ] && exit 0

run_log="$LOG_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
status=0
{
  echo "==> $(date -Is)  $local_head -> $remote_head"
  git reset --hard origin/main
  ./deploy/deploy.sh
} > "$run_log" 2>&1 || status=$?

echo "$(date -Is)  $remote_head exit $status, see $run_log" >> "$POLL_LOG"
# Keep the last 30 run logs.
ls -1t "$LOG_DIR"/deploy-*.log 2>/dev/null | tail -n +31 | xargs -r rm --
exit "$status"
