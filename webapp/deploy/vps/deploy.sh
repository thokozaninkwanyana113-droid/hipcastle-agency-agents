#!/usr/bin/env bash
# Pull the latest main branch and rebuild/restart Hipcastle. Run on the server from anywhere.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPOSE="docker compose -f $REPO_DIR/webapp/deploy/vps/docker-compose.yml"

cd "$REPO_DIR"
if [ ! -f webapp/.env ]; then
  echo "webapp/.env is missing — copy webapp/.env.example to webapp/.env and fill it in first." >&2
  exit 1
fi

echo "→ Updating code"
git fetch --quiet origin main
git checkout --quiet main
git pull --quiet --ff-only origin main

echo "→ Backing up the database"
mkdir -p backups
if $COMPOSE ps --status running --services 2>/dev/null | grep -qx app; then
  $COMPOSE exec -T app node --input-type=commonjs - <<'JS'
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
fs.rmSync('/data/pre-deploy.db', { force: true });
new DatabaseSync(process.env.DATABASE_PATH).exec("VACUUM INTO '/data/pre-deploy.db'");
JS
  $COMPOSE cp app:/data/pre-deploy.db "backups/hipcastle-$(date +%Y%m%d-%H%M%S).db"
  echo "  saved to backups/"
else
  echo "  (app not running yet — skipping backup)"
fi

echo "→ Building and restarting"
$COMPOSE up -d --build

echo "→ Waiting for health check"
for i in $(seq 1 30); do
  if $COMPOSE exec -T app wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "✓ Hipcastle is up: https://www.hipcastle.agency"
    exit 0
  fi
  sleep 2
done
echo "✗ Health check failed — recent logs:" >&2
$COMPOSE logs --tail=50 app >&2
exit 1
