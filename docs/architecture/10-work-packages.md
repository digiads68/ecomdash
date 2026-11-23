# 10 — Gói việc cho agent triển khai

Mỗi gói (WP) có thể giao cho một agent. Agent phải đọc `00-overview.md` + các file được nêu trong gói. Chỉ bắt đầu gói khi gói phụ thuộc đã xong (tiêu chí hoàn thành đạt, đã commit).

```
WP0 nền monorepo
 ├─ WP1 tiktok-client ──┬─ WP2 mock-tiktok ──┐
 └─ WP3 database ───────┴─ WP4 api core ─────┼─ WP5 sync engine ─┐
                                              └─ WP6 api routes ──┼─ WP7 web nền ─ WP8 web trang
                                                                  └─ WP9 demo tooling ─ WP10 kiểm chứng E2E
```

## WP0 — Nền monorepo
Đọc: 00, 08.
- Thêm `apps/mock-tiktok`, `packages/tiktok-client` vào workspace (`pnpm-workspace.yaml` đã gồm `apps/*`, `packages/*`).
- Root scripts: `dev`, `demo`, `demo:connect`, `demo:reset`, `test`, `typecheck`.
- Xoá `apps/workers/`, `infra/docker/clickhouse/`; `docker-compose.yml` bỏ ClickHouse, thêm profile `demo`.
- Viết lại `.env.example` theo 08 §2. Cập nhật `CLAUDE.md` trỏ tới `docs/architecture/`.
**Xong khi:** `pnpm install` thành công; `pnpm -r exec tsc --noEmit` chạy được (có thể còn lỗi ở package chưa làm).

## WP1 — `packages/tiktok-client`
Đọc: 01, 02.
Cấu trúc:
```
src/
  index.ts
  http.ts                 # fetch + timeout + token bucket + backoff
  shop/
    sign.ts               # signShopRequest({path, query, body, appSecret}) → string
    webhook.ts            # verifyWebhookSignature(appKey, appSecret, rawBody, header) → boolean
    client.ts             # class ShopClient
    auth.ts               # ShopAuthClient: getToken(code), refreshToken(rt), buildAuthorizeUrl(state)
    types.ts              # kiểu wire: ShopOrder, ShopProduct, ... (snake_case như API)
    errors.ts             # TikTokShopError + lớp con theo 01 §4
  ads/
    client.ts             # class AdsClient
    auth.ts
    report.ts             # chunkDateRange(from, to, maxDays) + phân trang
    types.ts  errors.ts
```
API công khai tối thiểu:
```ts
new ShopClient({ baseUrl, appKey, appSecret, accessToken, shopCipher?, onTokenExpired?: () => Promise<string>, rps? })
  .getAuthorizedShops()
  .searchOrders(body, {pageSize, pageToken, sortField, sortOrder})        // 1 trang
  .iterateOrders(body, opts): AsyncGenerator<ShopOrder[]>                // mọi trang
  .getOrders(ids)
  .searchProducts / iterateProducts / getProduct(id)
  .getStatements(query) / iterateStatements
  .getOrderStatementTransactions(orderId)
  .searchReturns / iterateReturns / searchCancellations / iterateCancellations
  .getShopPerformance({startDateGe, endDateLt, granularity}) / getShopProductPerformance(...)
new AdsClient({ baseUrl, accessToken, rps? })
  .getAuthorizedAdvertisers(appId, secret) / getAdvertiserInfo(ids) / iterateCampaigns(advertiserId)
  .getGmvMaxCampaign(advertiserId, campaignId) / getGmvMaxStores(advertiserId)
  .integratedReport({advertiserId, startDate, endDate, metrics}) // tự chia đoạn + phân trang
  .gmvMaxReport({advertiserId, storeId, startDate, endDate, metrics})
```
Hằng số cấu hình được: `ADS_INTEGRATED_METRICS`, `ADS_GMV_MAX_METRICS`, `ADS_REPORT_MAX_DAYS=30`.
Không phụ thuộc Prisma/Nest. Build bằng `tsc` ra `dist/` (CJS) để Nest và mock dùng chung.
**Xong khi:** unit test: chữ ký (vector cố định, thứ tự key, loại `sign`/`access_token`, có/không body), webhook signature, chunkDateRange, map lỗi theo code, retry 36009002 (fake timers), refresh khi 105002 gọi `onTokenExpired` đúng 1 lần.

## WP2 — `apps/mock-tiktok`
Đọc: 07, 01, 02. Phụ thuộc WP1.
**Xong khi:** `test/contract.spec.ts` chạy `ShopClient`/`AdsClient` thật trên mock (khởi động trên cổng ngẫu nhiên) và kiểm: lấy shops → cipher; sai secret → 106001; thiếu cipher → 106013; `iterateOrders` lấy đủ `total_count`; TTL 2s → refresh tự động; report 45 ngày tự chia 2 đoạn; GMV Max trả dữ liệu cho đúng 1 store. Cùng seed → cùng tổng GMV.

## WP3 — `packages/database`
Đọc: 03, 08 §6.
- Thay `schema.prisma` theo 03 §2; xoá migration cũ, tạo `20261115000000_v2_init/migration.sql`.
- `src/index.ts` export `prisma` (singleton) + kiểu.
- `prisma/seed.ts`: Organization `{slug:'demo', name:'Hoa Sen Cosmetics (Demo)', plan:PRO}`, User demo OWNER, 3 AlertRule mẫu (ROAS<1.5 24h, tỉ lệ huỷ>8% 7d, GMV hôm nay<5tr), 1 ReportConfig weekly. **Không** seed shop/đơn — đến từ mock qua sync.
- Xoá stub `.prisma/client/default.d.ts` và alias `@prisma/client` trong tsconfig/jest khi client thật sinh được.
**Xong khi:** `db:migrate` + `db:seed` chạy trên Postgres trống; `tsc` của api thấy kiểu Prisma thật.

## WP4 — API core
Đọc: 05 §1–2, 04 §4, 04 §9. Phụ thuộc WP1, WP3.
- `config/` (zod validate env; `DEMO_MODE=true` + production → throw).
- `auth/`: `DemoAuthGuard`, sửa `ClerkGuard` (map `clerkOrgId`), chọn guard theo `AUTH_MODE`, `GET /me`, `GET /health`. *(đã thay bằng phiên cookie — WP12)*
- `crypto/token-cipher.ts` (chuyển `encrypt/decrypt` từ `tiktok.service.ts`, bỏ fallback khoá cứng trừ demo).
- `connections/` thay `tiktok/`: authorize-url, callback (state JWT), list, patch, delete; giữ `checkShopLimit()`.
- `webhooks/` (04 §9), bật `rawBody`.
- Xoá `metrics/clickhouse.service*`, `ads/`, `campaigns/`, `orders/`, `products/`, `customers/`, `export/` cũ (viết lại ở WP6).
**Xong khi:** callback tạo đúng `SellerAuthorization` + 2 `Shop` trên mock; webhook sai chữ ký 401, trùng id không tạo job lần 2 (test e2e Nest + mock).

## WP5 — Sync engine
Đọc: 04 toàn bộ, 03 §3–4. Phụ thuộc WP2, WP4.
**Xong khi:**
- Mapper có unit test với fixture JSON lấy từ mock.
- Test tích hợp (Postgres + Redis thật, mock thật): backfill → số `Order` = số đơn mock trong 30 ngày; Σ `ShopDailyStat.gmv` = Σ GMV mock tính độc lập; chạy incremental 2 lần không đổi số liệu; `POST /__mock/tick` rồi chạy incremental → đơn mới xuất hiện; TTL ngắn → refresh, không lỗi; ads 2 nguồn được ghi riêng.

## WP6 — API routes đọc dữ liệu
Đọc: 05 §3–11, 03 §4. Phụ thuộc WP4 (dữ liệu từ WP5 để test thủ công).
- Module: `shops`, `overview`, `orders`, `products`, `finance`, `ads`, `returns`, `customers`, `alerts`, `reports`, `export`, `sync`.
- Mọi service nhận `orgId` và kiểm quyền shop. Phép tính chỉ số dùng hàm chung `packages/shared/src/metrics.ts`.
- DTO trong `packages/shared/src/dto/`.
**Xong khi:** Jest service test (Prisma mock) cho từng module; test đặc biệt: kỳ trước/kỳ này, chia chi QC theo tỉ lệ GMV, ROAS null khi spend = 0, truy cập shop tổ chức khác → 404.

## WP7 — Web nền
Đọc: 06 §1–2, §4. Phụ thuộc WP6 (DTO).
Sửa nền (06 §1), Sidebar mới, Topbar (ShopSwitcher, DateRangePicker, cập nhật lúc), chế độ auth demo, hooks TanStack Query cho mọi endpoint, component dùng chung (KpiCard + sparkline, DataTable, StatusBadge, EmptyState, ErrorState, Skeleton).
**Xong khi:** `next build` thành công không có khoá Clerk; điều hướng mọi mục không lỗi.

## WP8 — Web trang
Đọc: 06 §3, `docs/mockups/`. Phụ thuộc WP7.
Làm theo thứ tự ưu tiên: Tổng quan → Đơn hàng (+ chi tiết) → Quảng cáo → Tài chính → Sản phẩm → Cài đặt/Kết nối → Hoàn/Huỷ → Khách hàng → Cảnh báo → Báo cáo.
**Xong khi:** mỗi trang khớp bố cục mockup, có đủ 3 trạng thái (tải/rỗng/lỗi).

## WP9 — Công cụ demo
Đọc: 08. Phụ thuộc WP5, WP7.
`scripts/demo.sh`, `scripts/demo-connect.ts`, `scripts/demo-reset.sh`, `scripts/db-apply.sh`, Dockerfile cho `api`, `web`, `mock-tiktok`, `docker-compose.yml` profile `demo`.
**Xong khi:** từ máy sạch (chỉ có Postgres + Redis), `pnpm install && cp .env.example .env && pnpm demo` cho dashboard có số liệu trong ≤ 3 phút.

## WP11 — Lãi lỗ (P&L)
Đọc: 11 toàn bộ. Phụ thuộc WP3, WP5; web phần trong WP8.
- `packages/shared/src/pnl/*` hàm thuần + unit test: phân loại kết cục (mọi nhánh §4), `computeOrderEconomics` (đã/chưa đối soát, restock), giá vốn theo ngày hiệu lực, 3 kiểu CostItem, ước tính PENDING, phân bổ QC nhiều shop, bất biến thác §7.
- Job `pnl.recompute` + kích hoạt §10; module `pnl`, `costs` (gồm nhập/xuất Excel bằng `exceljs`).
- Seed demo: giá vốn cho ~80% SKU, CostItem mẫu (Đóng gói 3.500₫/đơn SHIPPED, Quà tặng 6.000₫/đơn SUCCESS, Lương CSKH 12tr/tháng).
**Xong khi:** sửa giá vốn một SKU qua API → `/pnl/summary` đổi đúng phần giá vốn tương ứng; thác khớp bất biến trên dữ liệu demo.

## WP10 — Kiểm chứng E2E
Playwright (Chromium có sẵn tại `/opt/pw-browsers`): mở từng trang, chờ dữ liệu, kiểm không có lỗi console, chụp ảnh `docs/screenshots/*.png`; đối chiếu số GMV 30 ngày trên Tổng quan với `/__mock/state`.
**Xong khi:** mọi trang có ảnh chụp có số liệu; `pnpm test` và `pnpm typecheck` sạch.

## WP12 — Tài khoản hai tầng, gắn kết hai nền tảng, đồng bộ cùng khung (`12-accounts-and-access.md`)
- Schema + migration `20261122000000_accounts_access`; seed tài khoản DigiAds.
- `access/` (hàm thuần + bảng quyền), phiên cookie, mật khẩu, đăng nhập TikTok Shop, lời mời; gỡ Clerk.
- Kho chưa gán, gắn thay khách, BC agency, AuditLog, `AdvertiserAuthorization` + chọn token; vòng `org.round` + `SyncRound`; dữ liệu QC phía Shop.
- Mock 3 seller + BC + trường QC phía Shop; `demo-connect` 3 kịch bản; `scripts/check-access.ts`.
- Web: `/login`, `/invite`, `/onboarding`, `/admin/*`, Thành viên, Tài khoản, chế độ chỉ đọc, mốc đồng bộ chung, đổi tên Dashboard.

**Xong khi:** `pnpm demo` từ DB trống dựng đủ 3 khách; `pnpm check:access` đạt hết; test (`access.spec`, mappers, contract mock) xanh; Playwright đăng nhập từng vai trò không lỗi console, không tràn ngang.
