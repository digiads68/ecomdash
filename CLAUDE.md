# EcomDash — Developer Guide

SaaS **profit-and-loss operating dashboard** for TikTok Shop sellers in Vietnam: real order outcomes (success / cancelled / returned / pending), TikTok ROAS vs real ROAS vs break-even ROAS, and a full cost breakdown (SKU cost of goods, platform fees, other platform fees, seller-defined costs, ads).

**Design docs are the source of truth:** `docs/architecture/` — start with `00-overview.md`; money/ROAS rules in `11-profit-and-loss.md`; work packages in `10-work-packages.md`. UI reference: `docs/mockups/index.html`, screenshots of the running app in `docs/screenshots/`.

## Monorepo

```
apps/web/            Next.js 14 dashboard (:3000)
apps/api/            NestJS REST + BullMQ sync workers + webhook receiver (:4000)
apps/mock-tiktok/    Fastify simulator of TikTok Shop + Ads APIs (:4010) — dev/demo/tests only
packages/database/   Prisma schema, migrations, demo-org seed
packages/shared/     Pure P&L functions (outcome, economics, daily, waterfall, ROAS) + API DTOs
packages/tiktok-client/  Signed TikTok Shop client, Marketing API client
scripts/             demo.sh, demo-connect.ts, demo-reset.sh
```

Internal packages build to `dist/` (`pnpm build:packages`); rebuild them after editing.

## Run locally (demo data, no TikTok or Clerk keys)

Needs Node ≥ 20, pnpm 9, PostgreSQL ≥ 14 and Redis ≥ 6 (or Docker).

```bash
pnpm install
pnpm demo            # migrates, seeds, builds, starts mock + api + web, connects demo shop & ads, enters sample costs
# open http://localhost:3000
```

With Docker: `cp .env.example .env && docker compose --profile demo up --build`.
Reset demo data: `pnpm demo:reset`. Details: `docs/architecture/08-local-dev.md`.

## Tests

```bash
pnpm --filter @ecomdash/shared test        # P&L math (outcomes, economics, waterfall invariants, ROAS)
pnpm --filter @ecomdash/tiktok-client test # signing, refresh, backoff, report chunking
pnpm --filter @ecomdash/mock-tiktok test   # contract tests: real clients against the mock
pnpm --filter @ecomdash/api test           # mappers
```

## Key rules (see docs for detail)

- Every query filters by `organizationId`; `req.orgId` comes from `AuthGuard` (`AUTH_MODE=demo` → fixed demo org, `clerk` → JWT `org_id` → `Organization.clerkOrgId`).
- Money from TikTok arrives as strings → `Decimal(18,2)`; never sum floats in SQL for money columns you store.
- Periods group orders by **order date** in `Asia/Ho_Chi_Minh`; ads by spend date.
- P&L is recomputed by the `pnl.recompute` job (`apps/api/src/pnl/pnl-compute.service.ts`) whenever orders, returns, settlements, ad stats or costs change. Pure logic lives in `packages/shared/src/pnl/` — change it there and keep the waterfall invariants test green.
- TikTok tokens are AES-256-GCM encrypted (`apps/api/src/common/crypto.ts`); Shop access tokens refresh under a Postgres advisory lock.
- Items marked **[CHƯA XÁC MINH]** in `docs/architecture/01`/`02` must be checked against the real APIs before go-live (`09-go-live-checklist.md`).

## Design system

Primary `#3B82F6`, sidebar `bg-gray-900` with active `bg-primary-600`, good `text-green-600/bg-green-50`, bad `text-red-600/bg-red-50`. Money via `formatVND` / `formatVNDCompact` (`apps/web/lib/format.ts`). UI language: Vietnamese.
