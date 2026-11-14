# 00 — Tổng quan kiến trúc EcomDash v2

> Đọc file này trước. Mọi tài liệu khác trong `docs/architecture/` là chi tiết của từng phần ở đây.
> Trạng thái: **ĐỀ XUẤT — chờ duyệt**. Khi đã duyệt, các agent triển khai theo `10-work-packages.md`.

## 1. Sản phẩm làm gì

SaaS **điều hành bán hàng theo lãi lỗ** cho seller TikTok Shop tại Việt Nam. Trang chủ trả lời: trong kỳ này shop bán được bao nhiêu đơn thật (sau huỷ/hoàn), quảng cáo tốn bao nhiêu cho số đơn đó, ROAS thực so với ROAS TikTok báo, và sau giá vốn, phí sàn, chi phí tự nhập thì lãi hay lỗ (`11-profit-and-loss.md`). Hệ thống gom dữ liệu **TikTok Shop** (đơn hàng, sản phẩm, đối soát, hoàn/huỷ) và **TikTok Ads** (chiến dịch Shop Ads thủ công + GMV Max) vào một dashboard, tính ra lợi nhuận thực và hiệu quả quảng cáo, gửi cảnh báo và báo cáo định kỳ.

## 2. Vì sao phải làm lại

Bản v1 đoán hình dạng API TikTok nên sai ở tầng tích hợp:

| Vấn đề v1 | Thực tế theo tài liệu TikTok |
|---|---|
| Gọi Shop API không ký, không `app_key`/`timestamp`/`sign` | Mọi request phải ký HMAC-SHA256 (xem `01-tiktok-shop-api.md` §3) |
| Không có `shop_cipher` | Bắt buộc với mọi API theo shop, lấy từ `GET /authorization/202309/shops` |
| `GET /order/202309/orders/search` | Là **POST**, filter trong body, phân trang trong query |
| Không refresh token | Access token Shop sống ~7 ngày, phải refresh |
| Mọi thứ ghi thành "điểm metric" vào ClickHouse | API trả **thực thể** (đơn, dòng hàng, giao dịch đối soát) — cần lưu thực thể để xem chi tiết, đối soát, tính lại |
| Lợi nhuận = GMV × % cố định | Có API đối soát trả phí sàn, hoa hồng, phí giao dịch thật theo từng đơn |
| Ads: chỉ `report/integrated/get` | GMV Max có endpoint báo cáo riêng `/gmv_max/report/get/`, phải tách nguồn |

Ngoài ra các tầng không khớp nhau (tenant id Clerk ≠ id Prisma, URL `/api/api`, hai trang cùng `/`, thiếu `postcss.config.js`, shop selector không bao giờ được set) → dashboard trống; web/API không chạy nếu thiếu khoá Clerk.

## 3. Ba quyết định kiến trúc

1. **PostgreSQL là kho dữ liệu duy nhất.** Lưu thực thể gốc + bảng tổng hợp theo ngày (`ShopDailyStat`, `ProductDailyStat`, `AdDailyStat`). ClickHouse bị loại khỏi đường chính. Seller VN cỡ vừa có 10³–10⁵ đơn/tháng — Postgres với chỉ mục đúng là đủ. Nếu sau này cần, thêm ClickHouse làm kho phân tích phụ, đồng bộ từ Postgres (không phải từ TikTok).
2. **Toàn bộ backend viết bằng TypeScript.** Bỏ `apps/workers` (Python). Job đồng bộ chạy trong NestJS bằng BullMQ trên Redis. Một ngôn ngữ → dùng chung client TikTok, kiểu dữ liệu, mã hoá token, Prisma.
3. **`packages/tiktok-client` + `apps/mock-tiktok`.** Client có base URL cấu hình được. Mock server giả lập đúng hợp đồng (path, method, ký, envelope, phân trang, mã lỗi). Demo và test chạy trên mock; lên production chỉ đổi base URL + khoá.

## 4. Sơ đồ

```
                ┌──────────────── TikTok (thật)  hoặc  apps/mock-tiktok (:4010) ───────────────┐
                │  Shop Open API · Shop Auth · Ads Marketing API v1.3 · Webhook sender          │
                └───────▲──────────────────────────▲─────────────────────────────┬─────────────┘
                        │ signed HTTPS             │ Access-Token                │ POST webhook
                ┌───────┴──────────────────────────┴───────┐                     │
                │        packages/tiktok-client            │                     │
                │  ShopClient (sign, cipher, refresh)      │                     │
                │  AdsClient (report chunking)             │                     │
                └───────▲──────────────────────────────────┘                     │
                        │                                                         ▼
┌───────────────────────┴──────────────────── apps/api (NestJS :4000) ──────────────────────────┐
│ sync/ (BullMQ workers + scheduler)   webhooks/   connections/ (OAuth)                          │
│ overview/ orders/ products/ finance/ ads/ returns/ customers/ alerts/ reports/ export/         │
│ auth: DemoAuthGuard | ClerkGuard  (AUTH_MODE)                                                  │
└──────────┬──────────────────────────────────────────────────────────────▲─────────────────────┘
           │ Prisma                                       Redis (BullMQ)   │ REST JSON
     ┌─────▼──────┐                                       ┌───────────┐    │
     │ PostgreSQL │                                       │  Redis    │    │
     └────────────┘                                       └───────────┘    │
                                                     ┌─────────────────────┴───────┐
                                                     │ apps/web (Next.js 14 :3000) │
                                                     └─────────────────────────────┘
```

Luồng dữ liệu: **TikTok → tiktok-client → sync job → Postgres (thực thể) → rollup → bảng ngày → API → web**.
Webhook **không** phải nguồn dữ liệu chính: TikTok nói rõ webhook có thể mất. Webhook chỉ đẩy một job sync đích danh sớm hơn lịch; polling theo `update_time` mới là nguồn sự thật.

## 5. Cấu trúc monorepo đích

```
apps/
  web/              Next.js 14 App Router
  api/              NestJS: REST + sync + webhook + alert + report
  mock-tiktok/      Fastify server giả lập TikTok (chỉ dev/demo/test)
packages/
  tiktok-client/    Client Shop + Ads, ký request, kiểu wire, lỗi
  database/         Prisma schema, migration, seed tổ chức demo
  shared/           DTO + enum dùng chung api ↔ web
docs/
  architecture/     Bộ tài liệu này
  mockups/          Giao diện giả định (HTML tĩnh) để duyệt
scripts/demo.sh     Chạy demo local không cần Docker
docker-compose.yml  postgres + redis (+ profile demo: mock, api, web)
```

Bị xoá: `apps/workers/`, `infra/docker/clickhouse/`, `apps/api/src/metrics/clickhouse.service.ts` (+ spec).

## 6. Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Seller authorization | Một lần seller uỷ quyền app; cho 1 cặp access/refresh token, có thể phủ nhiều shop |
| Shop | Một cửa hàng TikTok Shop; định danh `shop_id`, gọi API cần `cipher` |
| `shop_cipher` | Chuỗi định tuyến (dạng `ROW_...`) bắt buộc trên API theo shop |
| Advertiser | Tài khoản quảng cáo TikTok Ads (`advertiser_id`) |
| Store link | Quan hệ advertiser ↔ shop (từ `/gmv_max/store/list/`), nhiều–nhiều |
| GMV | Tổng `payment.total_amount` của đơn hợp lệ (không tính UNPAID, CANCELLED) |
| ROAS TikTok | Doanh thu TikTok quy cho quảng cáo ÷ chi QC — tính cả đơn huỷ/hoàn (GMV Max còn gồm organic) |
| ROAS thực | ROAS TikTok × tỉ lệ thành doanh thu (sau huỷ/hoàn) của shop |
| ROAS thực nhận | ROAS thực × (thực nhận ÷ doanh thu thực) |
| ROAS hoà vốn | Doanh thu thực ÷ lãi gộp trước quảng cáo |
| Kết cục đơn | SUCCESS · PARTIAL_RETURN · RETURNED · CANCELLED · PENDING (`11` §4) |
| Gom kỳ | Theo ngày đặt đơn (cohort) |
| Thực nhận (settlement) | Số tiền TikTok thanh toán cho seller sau phí, từ API finance |
| Ngày kinh doanh | Ngày theo múi giờ shop (`Asia/Ho_Chi_Minh`), dùng cho mọi bảng tổng hợp |

## 7. Nguyên tắc bắt buộc

- Mọi truy vấn dữ liệu nghiệp vụ lọc theo `organizationId` (multi-tenant).
- Tiền: TikTok trả **chuỗi**. Lưu `Decimal(18,2)` trong Postgres; VND không có phần lẻ nhưng giữ 2 chữ số để dùng chung cho tiền tệ khác. Không dùng `float` để cộng tiền.
- Thời gian: lưu UTC (`timestamptz`); quy đổi sang ngày kinh doanh theo `Shop.timezone` khi rollup.
- PII người mua: không lưu tên/điện thoại/địa chỉ đầy đủ. Lưu `buyerHash = sha256(user_id + PII_SALT)`, tỉnh/thành (`district_info` cấp 1) để phân tích địa lý.
- Token TikTok: mã hoá AES-256-GCM (định dạng hiện có `base64(nonce12 ‖ ciphertext ‖ tag16)`), khoá `ENCRYPTION_KEY`. Không fallback khoá cứng ngoài `AUTH_MODE=demo`.
- Sync idempotent: upsert theo id TikTok; chạy lại không nhân đôi số liệu.
- Mọi mục đánh dấu **[CHƯA XÁC MINH]** trong `01`/`02` phải kiểm lại với API thật trước go-live (`09-go-live-checklist.md`).

## 8. Mục lục

| File | Nội dung |
|---|---|
| `01-tiktok-shop-api.md` | Hợp đồng TikTok Shop Partner API dùng trong hệ thống |
| `02-tiktok-ads-api.md` | Hợp đồng TikTok Marketing API v1.3 (Shop Ads + GMV Max) |
| `03-data-model.md` | Prisma schema đích, ánh xạ trường API → cột |
| `04-sync-engine.md` | Job, lịch, cursor, idempotency, retry, rollup, webhook |
| `05-api-contracts.md` | Route REST + DTO giữa api ↔ web |
| `06-frontend.md` | Trang, component, trạng thái, quy ước UI |
| `07-mock-server.md` | Đặc tả mock TikTok + bộ sinh dữ liệu |
| `08-local-dev.md` | Chạy local: không Docker và có Docker |
| `09-go-live-checklist.md` | Đăng ký app, scope, mục cần xác minh |
| `10-work-packages.md` | Gói việc cho agent, phụ thuộc, tiêu chí hoàn thành |
| `11-profit-and-loss.md` | **Điều hành lãi lỗ**: kết cục đơn, thác lãi lỗ, ROAS TikTok vs thực, giá vốn SKU, chi phí tự nhập — nguồn chuẩn cho mọi con số tiền |
