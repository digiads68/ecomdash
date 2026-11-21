# 08 — Chạy local

Hai cách, cùng kết quả: dashboard tại http://localhost:3000 với dữ liệu giả lập đi qua mock TikTok → sync → Postgres.

## 1. Yêu cầu
- Node ≥ 20, pnpm 9.
- PostgreSQL ≥ 14 và Redis ≥ 6 — cài sẵn trên máy **hoặc** Docker.

## 2. Biến môi trường (`.env.example` → `.env`)

```dotenv
# Chế độ
NODE_ENV=development
DEMO_MODE=true                       # khoá dự phòng + tài khoản demo trên /login; production phải để false
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

# Tài khoản DigiAds đầu tiên (seed). Production: bắt buộc SEED_ADMIN_PASSWORD
SEED_ADMIN_EMAIL=admin@digiads.vn
SEED_ADMIN_PASSWORD=
SESSION_DAYS=30

# Mock: cho Ads API trễ N phút để thử cảnh báo "Quảng cáo trễ"
# MOCK_ADS_DELAY_MIN=45

# Stripe / SendGrid / Telegram — để trống ở demo (email chỉ ghi log)
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
3. `pnpm --filter @ecomdash/database db:migrate` rồi `db:seed` (tạo `admin@digiads.vn` Super admin và `mod@digiads.vn` Mod, mật khẩu `demo12345`).
4. Chạy song song (`concurrently`): mock (4010), api (4000), web (3000).
5. Chờ api sẵn sàng (`/api/health`), gọi `pnpm demo:connect` — dựng 3 khách qua đúng các endpoint thật (`12` §8): Hoa Sen tự đăng nhập TikTok + gắn Ads + mời nhân viên;
   Thời Trang Mây uỷ quyền từ App Store rồi được admin gắn thay (shop + tài khoản QC qua BC DigiAds); Đồ Chơi Bin chỉ gắn Shop. Giao 2 shop cho Mod. Chờ backfill, nhập giá vốn mẫu.
6. In danh sách tài khoản và "Mở http://localhost:3000".

### Tài khoản demo (mật khẩu chung `demo12345`)
| Email | Vai trò | Thấy |
|---|---|---|
| `admin@digiads.vn` | Super admin DigiAds | 3 khách, 4 shop, trang Quản trị |
| `mod@digiads.vn` | Mod DigiAds | Hoa Sen Beauty + Thời Trang Mây, chỉ xem |
| `owner@hoasen.vn` | Chủ Hoa Sen | 2 shop Hoa Sen, sửa được |
| `nhanvien@hoasen.vn` | Thành viên Hoa Sen | 1 shop, chỉ xem |
| "Đăng nhập bằng TikTok Shop" → chọn Đồ Chơi Bin | Chủ Đồ Chơi Bin | thẻ "Hoàn tất kết nối" → onboarding |

Kiểm tra ma trận quyền sau khi demo chạy: `pnpm check:access`.

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
| `pnpm check:access` | kiểm ma trận quyền + gắn thay khách + mốc đồng bộ chung qua API thật |
| `pnpm doctor` | kiểm Node/pnpm, Postgres, Redis, cổng 3000/4000/4010 |

## 6. Prisma trong môi trường mạng hạn chế
`prisma generate` cần tải query engine từ `binaries.prisma.sh`. Nếu bị chặn:
1. Dùng Prisma ≥ 6.16 với `previewFeatures = ["driverAdapters", "queryCompiler"]` + `@prisma/adapter-pg` (không cần engine nhị phân) — cấu hình sẵn trong `packages/database`.
2. Nếu CLI vẫn cần engine schema để chạy migrate: áp file `migration.sql` trực tiếp bằng `psql "$DATABASE_URL" -f ...` (`scripts/db-apply.sh`).
3. Hoặc mở host `binaries.prisma.sh` trong cấu hình mạng của môi trường.

## 7. Chạy trên máy của bạn (macOS / Windows / Linux)

Môi trường cloud của Claude Code và máy cá nhân dùng cùng một repo, cùng lệnh `pnpm demo`.

1. **Node 20 + pnpm 9**
   - Node: `nvm install` (đọc `.nvmrc`) hoặc tải bản LTS 20 từ nodejs.org.
   - pnpm: `corepack enable` (đi kèm Node) — `package.json` khai báo `packageManager: pnpm@9`.
2. **PostgreSQL 16 + Redis 7** — chọn một:
   - macOS (Homebrew): `brew install postgresql@16 redis && brew services start postgresql@16 && brew services start redis`.
     `pnpm demo` tự gọi `brew services start` nếu thấy chưa chạy.
   - Windows: dùng **WSL2** (Ubuntu) rồi làm như Linux: `sudo apt install postgresql redis-server && sudo service postgresql start && sudo service redis-server start`.
   - Bất kỳ hệ nào có **Docker Desktop**: `docker compose up -d postgres redis` (chỉ hạ tầng) hoặc cả hệ thống: `docker compose --profile demo up --build`.
3. **Lấy code và chạy**
   ```bash
   git clone <repo> ecomdash && cd ecomdash
   git checkout claude/plan-implementation-strategy-1NoK9   # nhánh đang phát triển
   pnpm install
   pnpm doctor        # kiểm tra trước: phiên bản, DB, Redis, cổng
   pnpm demo          # migrate, seed, build, chạy mock + api + web, dựng 3 khách demo
   ```
   Mở http://localhost:3000 và đăng nhập bằng tài khoản ở §3.
4. **Phát triển** (tự build lại khi sửa code): sau khi `pnpm demo` đã chạy một lần, dừng nó và dùng `pnpm dev` (mock + api + web ở chế độ watch).
   Sửa `packages/*` thì chạy `pnpm build:packages`.
5. **Dùng Claude Code trên máy**: cài Claude Code (CLI, desktop app hoặc extension VS Code/JetBrains), mở thư mục `ecomdash` — file `CLAUDE.md` và `docs/architecture/` là ngữ cảnh cho agent.
   Có thể tiếp tục phiên cloud trên máy qua **Remote Control** của desktop app (Settings → Claude Code → Remote Control) hoặc `claude --teleport`.
6. **Lỗi thường gặp**
   - `Port 3000 is already in use` → `lsof -i :3000` rồi tắt tiến trình cũ.
   - `Cannot connect with DATABASE_URL` → Postgres chưa chạy hoặc chưa có role `ecomdash` (script tự tạo nếu bạn là superuser Postgres; trên macOS Homebrew user hiện tại là superuser).
   - Đăng nhập xong bị đẩy về `/login` → web và API phải cùng host (`localhost`, không trộn `127.0.0.1`), vì cookie phiên theo host.
