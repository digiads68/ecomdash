# 08 — Chạy local

Hai cách, cùng kết quả: dashboard tại http://localhost:3000 với dữ liệu giả lập đi qua mock TikTok → sync → Postgres.

## 1. Yêu cầu
- Node ≥ 20, pnpm 9.
- PostgreSQL ≥ 14 và Redis ≥ 6 — cài sẵn trên máy **hoặc** Docker.

## 2. Biến môi trường (`.env.example` → `.env`)

```dotenv
# Chế độ
NODE_ENV=development
AUTH_MODE=demo                       # demo | clerk
NEXT_PUBLIC_AUTH_MODE=demo
NEXT_PUBLIC_DEMO_MODE=true

# Hạ tầng
DATABASE_URL=postgresql://ecomdash:ecomdash@localhost:5432/ecomdash
REDIS_URL=redis://localhost:6379
SYNC_WORKER=true
BACKFILL_DAYS=60

# URL
APP_URL=http://localhost:3000
API_PUBLIC_URL=http://localhost:4000
NEXT_PUBLIC_API_URL=http://localhost:4000

# TikTok Shop (trỏ mock)
TIKTOK_SHOP_BASE_URL=http://localhost:4010/shop
TIKTOK_AUTH_BASE_URL=http://localhost:4010/shop-auth
TIKTOK_SHOP_AUTHORIZE_URL=http://localhost:4010/shop-auth/open/authorize
TIKTOK_SHOP_SERVICE_ID=mock_service
TIKTOK_APP_KEY=mock_app_key
TIKTOK_APP_SECRET=mock_app_secret
TIKTOK_SHOP_REDIRECT_URI=http://localhost:4000/api/connections/shop/callback

# TikTok Ads (trỏ mock)
TIKTOK_ADS_BASE_URL=http://localhost:4010/ads/open_api/v1.3
TIKTOK_ADS_AUTHORIZE_URL=http://localhost:4010/ads/portal/auth
TIKTOK_ADS_APP_ID=mock_ads_app
TIKTOK_ADS_APP_SECRET=mock_ads_secret
TIKTOK_ADS_REDIRECT_URI=http://localhost:4000/api/connections/ads/callback

# Mock server
MOCK_TIKTOK_PORT=4010
MOCK_SEED=20261111
MOCK_HISTORY_DAYS=60
MOCK_TICK_SEC=60
MOCK_WEBHOOK_URL=http://localhost:4000/api/webhooks/tiktok
MOCK_SHOP_REDIRECT_URI=http://localhost:4000/api/connections/shop/callback

# Bảo mật (giá trị demo — KHÔNG dùng production)
ENCRYPTION_KEY=ZGVtby1rZXktMzItYnl0ZXMtZm9yLWVjb21kYXNoISE=
STATE_JWT_SECRET=demo-state-secret
PII_SALT=demo-pii-salt

# Clerk / Stripe / SendGrid / Telegram — để trống ở demo
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SENDGRID_API_KEY=
TELEGRAM_BOT_TOKEN=
```

## 3. Cách A — không Docker (`pnpm demo`)

```bash
pnpm install
cp .env.example .env
pnpm demo
```
`scripts/demo.sh` làm lần lượt:
1. Kiểm Postgres ở `DATABASE_URL` (`pg_isready`). Không chạy → thử `pg_ctlcluster <ver> main start` hoặc `pg_ctl` trong thư mục dữ liệu riêng `.local/pg`; tạo role/database `ecomdash` nếu thiếu.
2. Kiểm Redis (`redis-cli ping`); không chạy → `redis-server --daemonize yes --dir .local/redis`.
3. `pnpm --filter @ecomdash/database db:migrate` rồi `db:seed` (tạo tổ chức demo slug `demo`, user demo, gói PRO, rule cảnh báo mẫu, ReportConfig mẫu).
4. Chạy song song (`concurrently`): mock (4010), api (4000), web (3000).
5. Chờ api sẵn sàng (`/api/health`), gọi `pnpm demo:connect` — script dùng `/__mock/auto-authorize` + callback của api để tạo kết nối Shop và Ads như người dùng bấm thật, rồi chờ backfill xong (poll `/api/sync/status`).
6. In: "Mở http://localhost:3000".

Dừng: Ctrl+C. Xoá sạch dữ liệu: `pnpm demo:reset` (`prisma migrate reset` + seed + flush Redis; Prisma sẽ từ chối nếu lệnh do một AI agent chạy mà chưa có xác nhận của người dùng).

Token do mock cấp được ký HMAC nên vẫn hợp lệ sau khi mock khởi động lại. `SYNC_INTERVAL_FACTOR=0.2` làm lịch đồng bộ nhanh gấp 5 lần (đơn mỗi 3 phút) để thấy dữ liệu chạy.

## 4. Cách B — Docker

```bash
cp .env.example .env
docker compose --profile demo up --build
```
- Service: `postgres` (16-alpine), `redis` (7-alpine), `mock-tiktok`, `api`, `web`, `demo-connect` (chạy một lần).
- Trong compose, URL nội bộ dùng tên service (`postgres`, `redis`, `mock-tiktok`); biến được override trong `docker-compose.yml`, `.env` giữ giá trị localhost cho Cách A.
- Chỉ hạ tầng: `docker compose up -d postgres redis` rồi chạy app bằng `pnpm dev`.

## 5. Lệnh hữu ích

| Lệnh | Việc |
|---|---|
| `pnpm dev` | mock + api + web (không tự kết nối) |
| `pnpm demo:connect` | tạo kết nối demo + backfill |
| `pnpm test` | Jest mọi package (tiktok-client, api, mock) |
| `pnpm typecheck` | `tsc --noEmit` mọi package |
| `curl -X POST localhost:4010/__mock/tick` | sinh ngay một lô đơn mới |
| `curl localhost:4000/api/sync/status` | tình trạng đồng bộ (demo không cần token) |

## 6. Prisma trong môi trường mạng hạn chế
`prisma generate` cần tải query engine từ `binaries.prisma.sh`. Nếu bị chặn:
1. Dùng Prisma ≥ 6.16 với `previewFeatures = ["driverAdapters", "queryCompiler"]` + `@prisma/adapter-pg` (không cần engine nhị phân) — cấu hình sẵn trong `packages/database`.
2. Nếu CLI vẫn cần engine schema để chạy migrate: áp file `migration.sql` trực tiếp bằng `psql "$DATABASE_URL" -f ...` (`scripts/db-apply.sh`).
3. Hoặc mở host `binaries.prisma.sh` trong cấu hình mạng của môi trường.
