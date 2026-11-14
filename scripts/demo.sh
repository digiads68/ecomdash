#!/usr/bin/env bash
# EcomDash local demo without Docker: Postgres + Redis from the machine, mock TikTok, API, web.
# docs/architecture/08-local-dev.md §3
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(pwd)
mkdir -p .local/logs

say() { printf "\033[1;34m▸ %s\033[0m\n" "$*"; }
fail() { printf "\033[1;31m✗ %s\033[0m\n" "$*"; exit 1; }

[ -f .env ] || { cp .env.example .env; say "Created .env from .env.example"; }
set -a; . ./.env; set +a

command -v pnpm >/dev/null || fail "pnpm is required (corepack enable)"
PGHOST_PORT=$(node -e "const u=new URL(process.env.DATABASE_URL);console.log(u.hostname+' '+(u.port||5432))")
read -r PGH PGP <<<"$PGHOST_PORT"

# ── PostgreSQL ──
if ! pg_isready -h "$PGH" -p "$PGP" >/dev/null 2>&1; then
  say "PostgreSQL is not running — trying to start it"
  if command -v pg_ctlcluster >/dev/null && pg_lsclusters -h 2>/dev/null | grep -q .; then
    read -r ver name _ <<<"$(pg_lsclusters -h | head -1)"; (pg_ctlcluster "$ver" "$name" start || sudo pg_ctlcluster "$ver" "$name" start) >/dev/null
  elif command -v brew >/dev/null; then brew services start postgresql >/dev/null || true
  elif command -v docker >/dev/null && docker info >/dev/null 2>&1; then docker compose up -d postgres redis
  else fail "Start PostgreSQL ≥14 on $PGH:$PGP (or run: docker compose up -d postgres redis)"; fi
  for _ in $(seq 1 20); do pg_isready -h "$PGH" -p "$PGP" >/dev/null 2>&1 && break; sleep 1; done
fi
if ! psql "$DATABASE_URL" -c "select 1" >/dev/null 2>&1; then
  say "Creating role/database ecomdash"
  SQL="DO \$\$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='ecomdash') THEN CREATE ROLE ecomdash LOGIN PASSWORD 'ecomdash' CREATEDB; END IF; END\$\$;"
  if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then
    su postgres -c "psql -qc \"$SQL\"" && su postgres -c "createdb -O ecomdash ecomdash" 2>/dev/null || true
  else
    psql -h "$PGH" -p "$PGP" -d postgres -qc "$SQL" && createdb -h "$PGH" -p "$PGP" -O ecomdash ecomdash 2>/dev/null || true
  fi
  psql "$DATABASE_URL" -c "select 1" >/dev/null 2>&1 || fail "Cannot connect with DATABASE_URL=$DATABASE_URL"
fi

# ── Redis ──
if ! redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1; then
  command -v redis-server >/dev/null || fail "Start Redis ≥6 at $REDIS_URL (or run: docker compose up -d redis)"
  say "Starting redis-server"
  redis-server --daemonize yes --dir "$ROOT/.local" >/dev/null
  sleep 1
fi

# ── Build ──
[ -d node_modules ] || { say "pnpm install"; pnpm install; }
say "Building shared packages, migrating and seeding"
pnpm build:packages >/dev/null
pnpm --filter @ecomdash/database db:migrate
pnpm --filter @ecomdash/database db:seed
say "Building API and web (first run takes ~1 minute)"
pnpm --filter @ecomdash/api build >/dev/null
NODE_ENV=production pnpm --filter @ecomdash/web build >/dev/null

# ── Run ──
for port in "${MOCK_TIKTOK_PORT:-4010}" 4000 3000; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then fail "Port $port is already in use — stop the process using it (lsof -i :$port) and retry"; fi
done
say "Starting mock TikTok (:${MOCK_TIKTOK_PORT:-4010}), API (:4000), web (:3000) — logs in .local/logs"
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM
(cd apps/mock-tiktok && npx tsx src/server.ts > "$ROOT/.local/logs/mock.log" 2>&1) &
(cd apps/api && node dist/main > "$ROOT/.local/logs/api.log" 2>&1) &
(cd apps/web && NODE_ENV=production npx next start -p 3000 > "$ROOT/.local/logs/web.log" 2>&1) &
for _ in $(seq 1 60); do curl -sf "${API_PUBLIC_URL:-http://localhost:4000}/api/health" >/dev/null && break; sleep 1; done
curl -sf "${API_PUBLIC_URL:-http://localhost:4000}/api/health" >/dev/null || { tail -30 .local/logs/api.log; fail "API did not start"; }
pnpm demo:connect
say "Open http://localhost:3000 — Ctrl+C to stop"
wait
