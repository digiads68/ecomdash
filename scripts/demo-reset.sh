#!/usr/bin/env bash
# Wipes demo data (database + Redis queues) and re-seeds the demo organisation.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
pnpm --filter @ecomdash/database exec prisma migrate reset --force --skip-seed
pnpm --filter @ecomdash/database db:seed
redis-cli -u "$REDIS_URL" flushdb >/dev/null
echo "Reset done. Run: pnpm demo"
