# EcomDash — Developer Guide

**Dashboard** for TikTok Shop sellers in Vietnam, run by DigiAds (a TikTok Shop Partner) — call it "Dashboard" in the UI, never "lãi lỗ": real order outcomes (success / cancelled / returned / pending), TikTok ROAS vs real ROAS vs break-even ROAS, and a full cost breakdown (SKU cost of goods, platform fees, other platform fees, seller-defined costs, ads).

**Design docs are the source of truth:** `docs/architecture/` — start with `00-overview.md`; money/ROAS rules in `11-dashboard-metrics.md`; accounts, access, linking, synced rounds in `12-accounts-and-access.md`; work packages in `10-work-packages.md`. UI reference: `docs/mockups/index.html`, screenshots of the running app in `docs/screenshots/`.

## Monorepo

```
apps/web/            Next.js 14 dashboard (:3000)
apps/api/            NestJS REST + BullMQ sync workers + webhook receiver (:4000)
apps/mock-tiktok/    Fastify simulator of TikTok Shop + Ads APIs (:4010) — dev/demo/tests only
packages/database/   Prisma schema, migrations, seed of DigiAds staff accounts
packages/shared/     Pure P&L functions (outcome, economics, daily, waterfall, ROAS) + API DTOs
packages/tiktok-client/  Signed TikTok Shop client, Marketing API client
scripts/             demo.sh, demo-connect.ts (3 demo clients), check-access.ts, doctor.sh, demo-reset.sh
```

Internal packages build to `dist/` (`pnpm build:packages`); rebuild them after editing.

## Run locally (demo data, no TikTok keys)

Needs Node ≥ 20, pnpm 9, PostgreSQL ≥ 14 and Redis ≥ 6 (or Docker).

```bash
pnpm install
pnpm demo            # migrates, seeds, builds, starts mock + api + web, connects demo shop & ads, enters sample costs
# open http://localhost:3000 — demo accounts (password demo12345): admin@digiads.vn, mod@digiads.vn, owner@hoasen.vn, nhanvien@hoasen.vn
```

With Docker: `cp .env.example .env && docker compose --profile demo up --build`.
Check the machine first: `pnpm doctor`. Reset demo data: `pnpm demo:reset`. Access matrix against the running API: `pnpm check:access`. Details: `docs/architecture/08-local-dev.md`.

## Tests

```bash
pnpm --filter @ecomdash/shared test        # P&L math (outcomes, economics, waterfall invariants, ROAS)
pnpm --filter @ecomdash/tiktok-client test # signing, refresh, backoff, report chunking
pnpm --filter @ecomdash/mock-tiktok test   # contract tests: real clients against the mock
pnpm --filter @ecomdash/api test           # access matrix, mappers
```

## Key rules (see docs for detail)

- Two tiers: DigiAds platform roles (`User.platformRole`: SUPER_ADMIN/ADMIN see every shop, MOD only granted shops) and client org roles (OWNER/ADMIN all org shops, MEMBER granted shops via `ShopAccess`). All checks go through the pure functions in `apps/api/src/access/access.ts` (keep `access.spec.ts` green).
- Shop routes use `getShopForUser(access, shopId, "view"|"edit")` (out of scope → 404, read-only → 403); org routes use `resolveOrgId(access, orgId, mode)`; controllers take `@Acc() access: Access`. Never query by a raw org id from the request without these.
- Sessions: httpOnly cookie `ecomdash_session` issued by the API (scrypt passwords, Redis login rate limit); web fetches with `credentials: "include"`. `DEMO_MODE=true` only for demo (fallback secrets, demo accounts on /login).
- Clients sign in with TikTok Shop and must link TikTok Shop **and** TikTok Ads (or set `adsMode=NONE`); unassigned authorizations (App Store, DigiAds Business Center) live with `organizationId = null` until an admin assigns them; every link/unlink writes `AuditLog`.
- Ad spend comes only from the Marketing API. Shop-side ad data (`gmvMaxAdFee`, `GMV_PAYMENT_FOR_ADS`, GMV Max revenue share) is for cross-checking and must never be added to costs.
- Money from TikTok arrives as strings → `Decimal(18,2)`; never sum floats in SQL for money columns you store.
- Periods group orders by **order date** in `Asia/Ho_Chi_Minh`; ads by spend date.
- Orders, returns and ad reports sync in one `org.round` per organisation (`SyncRound` = common watermark).
- P&L is recomputed by the `pnl.recompute` job (`apps/api/src/pnl/pnl-compute.service.ts`) whenever orders, returns, settlements, ad stats or costs change. Pure logic lives in `packages/shared/src/pnl/` — change it there and keep the waterfall invariants test green.
- TikTok tokens are AES-256-GCM encrypted (`apps/api/src/common/crypto.ts`); Shop access tokens refresh under a Postgres advisory lock.
- Items marked **[CHƯA XÁC MINH]** in `docs/architecture/01`/`02` must be checked against the real APIs before go-live (`09-go-live-checklist.md`).

## Làm việc nhóm (nhiều session / nhiều tài khoản)

- Mỗi session một nhánh riêng `claude/<việc>`, PR nhỏ về `main`; `git pull --rebase` trước khi đẩy; không force-push nhánh chung.
- Trước khi bàn giao: `pnpm typecheck`, test 4 package, và `pnpm check:access` (sau `pnpm demo`).
- Migration Prisma: tránh hai người cùng sửa `schema.prisma` một lúc; tên migration có tiền tố thời gian; ghi rõ trong PR.
- Không commit `.env`, `.local/`, khoá/secret.
- Session mới đọc `CLAUDE.md` → `docs/architecture/00` và `12-accounts-and-access.md` trước khi sửa.

## Design system

Primary `#3B82F6`, sidebar `bg-gray-900` with active `bg-primary-600`, good `text-green-600/bg-green-50`, bad `text-red-600/bg-red-50`. Money via `formatVND` / `formatVNDCompact` (`apps/web/lib/format.ts`). UI language: Vietnamese.
