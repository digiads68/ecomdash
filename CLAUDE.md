# EcomDash — Developer Guide

## Project Overview

SaaS monitoring platform for TikTok Shop + TikTok Ads targeting Vietnam market. Sellers see all their commerce and advertising data in one unified dashboard instead of juggling 3-5 browser tabs.

## Monorepo Structure

```
apps/web/        Next.js 14 App Router frontend (port 3000)
apps/api/        NestJS REST API (port 4000)
apps/workers/    Python async data pipeline
packages/database/   Prisma schema + migrations
packages/shared/     Shared TypeScript types/DTOs
infra/docker/    PostgreSQL and ClickHouse init SQL
```

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
pnpm install

# 3. Run migrations and seed
pnpm --filter @ecomdash/database db:migrate
pnpm --filter @ecomdash/database db:seed

# 4. Seed ClickHouse with 30 days of synthetic data
cd apps/workers && python seed_clickhouse.py

# 5. Start all services
pnpm dev
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:
- `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — from Clerk dashboard
- `TIKTOK_APP_KEY` / `TIKTOK_APP_SECRET` — TikTok Shop developer app
- `TIKTOK_ADS_APP_ID` / `TIKTOK_ADS_APP_SECRET` — TikTok Ads developer app
- `TIKTOK_REDIRECT_URI` — must match OAuth callback URL registered with TikTok
- `ENCRYPTION_KEY` — 32-byte base64 string for AES-256-GCM token encryption
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — from Stripe dashboard
- `SENDGRID_API_KEY` — for invite and alert emails
- `TELEGRAM_BOT_TOKEN` — for Telegram alert notifications

## Architecture Decisions

### Data Storage
- **PostgreSQL**: org/user/shop/campaign entity data, alert rules, subscriptions
- **ClickHouse**: all time-series metrics (`metrics_local` table) — GMV, order_count, ad_spend, impressions, clicks, conversions
- **Redis**: BullMQ job queue, JWKS cache (1h TTL), metrics cache (5min TTL)

### Metrics Schema
All metrics share one wide table in ClickHouse:
```
(tenant_id, shop_id, metric_name, timestamp, value, dimensions Map(String,String))
```
ROAS is always computed at query time: `sum(gmv) / sum(ad_spend)`.

### Auth
Clerk handles auth. The NestJS `ClerkGuard` validates RS256 JWTs against Clerk's JWKS endpoint, caches keys for 1 hour, and extracts `org_id` → `req.orgId`.

All routes require auth unless decorated with `@Public()`.

### Token Encryption
TikTok OAuth tokens are stored AES-256-GCM encrypted. The same `ENCRYPTION_KEY` is used in both NestJS (`apps/api/src/tiktok/tiktok.service.ts`) and Python workers (`apps/workers/workers/crypto.py`). Format: `base64(nonce[12] + ciphertext + authTag[16])`.

### Multi-tenancy
`TenantMiddleware` reads `orgId` from Clerk JWT and sets `req.orgId`. Every database query must include `organizationId` in its WHERE clause.

## Plan Limits

| Plan       | Max Shops |
|-----------|-----------|
| STARTER   | 1         |
| PRO       | 5         |
| ENTERPRISE| Unlimited |

Enforced in `TiktokService.checkShopLimit()` before connecting a new shop.

## Worker Pipeline

Python workers run in `apps/workers/`:
- Every **15 minutes**: sync shop orders → ClickHouse, sync ad insights → ClickHouse
- Every **1 hour**: sync product catalog → PostgreSQL, sync campaign list → PostgreSQL
- Every **5 minutes**: evaluate alert rules → fire notifications if thresholds breached

## Alert System

Alert rules stored as JSONB in PostgreSQL:
```json
{
  "conditions": [{ "metric": "roas", "operator": "lt", "threshold": 1.5, "window": "1h" }],
  "logic": "AND",
  "actions": [
    { "type": "email", "to": "owner@shop.vn" },
    { "type": "telegram", "chatId": "-100123456" }
  ]
}
```

Supported metrics: `roas`, `gmv`, `ad_spend`, `order_count`, `impressions`, `clicks`.
Supported operators: `lt`, `lte`, `gt`, `gte`, `eq`.
Supported windows: `1h`, `2h`, `6h`, `24h`.

## Design System

- Primary accent: `#3B82F6` (blue-500) — configured as `primary` in Tailwind
- Positive metric change: `text-green-600` / `bg-green-50`
- Negative metric change: `text-red-600` / `bg-red-50`
- Sidebar: `bg-gray-900`, active item `bg-primary-600`
- All currency in VND via `formatVND()` / `formatVNDCompact()` from `apps/web/lib/format.ts`
- All dates in `Asia/Ho_Chi_Minh` timezone

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/auth/clerk.guard.ts` | JWT validation + org extraction |
| `apps/api/src/metrics/clickhouse.service.ts` | ClickHouse HTTP client |
| `apps/workers/workers/crypto.py` | Token decrypt/encrypt |
| `apps/web/lib/api-client.ts` | Fetch wrapper with Clerk JWT |
| `apps/web/lib/stores/shop-store.ts` | Global shop/date range state |
| `packages/database/prisma/schema.prisma` | Full data model |
