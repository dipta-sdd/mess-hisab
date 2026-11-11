#!/usr/bin/env bash
# Builds and releases Mess Hisab on the VPS from this checkout. Run as `user` (deploy/cron.sh does).
# The web app is built first, so a failed build changes nothing that is live.
set -euo pipefail
# Builds use a private Node 22 (pnpm 11 needs it); the system Node 20 belongs to other apps.
export PATH="/home/user/.local/mess-node/current/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=1

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="/home/user/web/mess-api.biponon.shop/public_html/server"
WEB_DIR="/home/user/web/mess.biponon.shop/app"
PUBLIC_URL="https://mess.biponon.shop"

echo "==> web: install and build"
cd "$REPO_DIR/web"
corepack pnpm install --frozen-lockfile
NEXT_PUBLIC_API_URL="$PUBLIC_URL" corepack pnpm build
# Static export: web/out is plain files (no Node server). nginx must serve index.html for every
# unknown path (try_files $uri /index.html) and send sw.js with Cache-Control: no-cache.

echo "==> api: sync code (keeps .env, vendor, storage)"
rsync -a --delete \
  --exclude=/.env --exclude=/vendor/ --exclude=/storage/ --exclude='/bootstrap/cache/*.php' \
  --exclude=/node_modules/ --exclude=/tests/ --exclude=/public/storage \
  "$REPO_DIR/api/" "$API_DIR/"
cd "$API_DIR"
composer install --no-dev --optimize-autoloader --no-interaction --no-progress
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
pm2 restart mess-queue

echo "==> web: release"
rsync -a --delete "$REPO_DIR/web/out/" "$WEB_DIR/"
pm2 delete mess-web 2>/dev/null || true
pm2 save

echo "==> done"
