#!/usr/bin/env bash
# Checks the machine before `pnpm demo` / `pnpm dev`: Node, pnpm, PostgreSQL, Redis, free ports. docs/architecture/08-local-dev.md §7
cd "$(dirname "$0")/.."
ok() { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
bad() { printf "\033[1;31m✗\033[0m %s\n" "$*"; FAIL=1; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*"; }
FAIL=0

[ -f .env ] && { set -a; . ./.env; set +a; ok ".env found"; } || warn ".env missing — pnpm demo will copy .env.example"
DATABASE_URL=${DATABASE_URL:-postgresql://ecomdash:ecomdash@localhost:5432/ecomdash}
REDIS_URL=${REDIS_URL:-redis://localhost:6379}

if command -v node >/dev/null; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 20 ] && ok "Node $(node -v)" || bad "Node $(node -v) — need ≥ 20 (nvm install; see .nvmrc)"
else bad "Node not found — install Node 20 (nvm install)"; fi

if command -v pnpm >/dev/null; then
  pmajor=$(pnpm -v | cut -d. -f1)
  [ "$pmajor" -ge 9 ] && ok "pnpm $(pnpm -v)" || bad "pnpm $(pnpm -v) — need 9 (corepack enable)"
else bad "pnpm not found — run: corepack enable"; fi

read -r PGH PGP <<<"$(node -e "const u=new URL(process.env.DATABASE_URL||'$DATABASE_URL');console.log(u.hostname+' '+(u.port||5432))" 2>/dev/null)"
if command -v pg_isready >/dev/null; then
  if pg_isready -h "$PGH" -p "$PGP" >/dev/null 2>&1; then
    ok "PostgreSQL accepting connections on $PGH:$PGP"
    if command -v psql >/dev/null && psql "$DATABASE_URL" -c "select 1" >/dev/null 2>&1; then ok "DATABASE_URL connects"
    else warn "PostgreSQL is up but DATABASE_URL does not connect yet — pnpm demo creates role/database ecomdash when it can"; fi
  else bad "PostgreSQL not running on $PGH:$PGP (brew services start postgresql@16 · sudo service postgresql start · docker compose up -d postgres)"; fi
elif command -v docker >/dev/null; then warn "pg_isready not found — using Docker? run: docker compose up -d postgres redis"
else bad "PostgreSQL client tools not found — install PostgreSQL ≥ 14 or Docker"; fi

if command -v redis-cli >/dev/null; then
  redis-cli -u "$REDIS_URL" ping >/dev/null 2>&1 && ok "Redis responds at $REDIS_URL" || bad "Redis not responding at $REDIS_URL (brew services start redis · sudo service redis-server start · docker compose up -d redis)"
else warn "redis-cli not found — fine if Redis runs in Docker"; fi

for port in 3000 4000 "${MOCK_TIKTOK_PORT:-4010}"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then warn "Port $port in use (ok if EcomDash is already running; otherwise: lsof -i :$port)"
  else ok "Port $port free"; fi
done

[ -d node_modules ] && ok "Dependencies installed" || warn "Run pnpm install"
[ "$FAIL" = 0 ] && { ok "Ready — run: pnpm demo"; exit 0; } || { echo; echo "Fix the items marked ✗ and run pnpm doctor again."; exit 1; }
