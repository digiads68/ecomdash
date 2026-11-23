# 09 — Checklist lên production với API thật

## 1. Đăng ký app

**TikTok Shop (Partner Center — partner.tiktokshop.com)**
- [ ] Tạo tài khoản Partner, chọn thị trường **Vietnam**.
- [ ] Tạo app: *Custom app* nếu chỉ phục vụ seller của mình (nhanh, ít review) hoặc *Public app* nếu bán SaaS cho nhiều seller (cần listing review, bản dịch tiếng Việt, app review).
- [ ] Bật user type **Seller**.
- [ ] Xin scope: Shop Authorized Information, Order Information, Product Basic, Finance Information, Return & Refund Basic, Data Analytics (shop/product performance), Fulfillment Basic (tracking — giai đoạn sau).
- [ ] Đặt Redirect URL: `https://<api-domain>/api/connections/shop/callback`.
- [ ] Đặt Webhook URL: `https://<api-domain>/api/webhooks/tiktok` (HTTPS, TLS ≥1.2, tên miền, không cổng), đăng ký type 1, 4, 5, 6, 7, 11, 12, 15, 16.
- [ ] Nếu bật IP allowlist: thêm IP egress của worker.
- [ ] Lấy `app_key`, `app_secret`, `service_id`.
- [ ] Tạo **development shop** VN trong Seller Center để thử.

**TikTok Ads (business-api.tiktok.com → My Apps)**
- [ ] Tạo app Marketing API, xin quyền: Ad Account Management, Campaign/Ad Management (read), Reporting, **GMV Max** (read), Business Center (read).
- [ ] Redirect URL: `https://<api-domain>/api/connections/ads/callback`.
- [ ] Lấy `app_id`, `secret`.

## 2. Cấu hình
- [ ] `DEMO_MODE=false`, `NEXT_PUBLIC_DEMO_MODE=false`; đặt `ENCRYPTION_KEY`, `STATE_JWT_SECRET`, `PII_SALT` thật.
- [ ] Seed Super admin đầu tiên: `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD` (≥ 8 ký tự) → `pnpm db:seed`; đăng nhập đổi mật khẩu, mời Admin/Mod ở `/admin/staff`.
- [ ] Web và API **cùng site** để cookie phiên `ecomdash_session` đi kèm (ví dụ proxy `/api` qua domain web, hoặc `app.` + `api.` cùng domain gốc), `APP_URL` https → cookie Secure.
- [ ] SendGrid cấu hình để gửi thư mời thành viên / nhân viên.
- [ ] Kết nối Business Center DigiAds ở `/admin/agency`; xác nhận thấy tài khoản khách đã chia sẻ.
- [ ] Đổi `TIKTOK_*_BASE_URL` về host thật (giá trị trong `01`/`02`).
- [ ] `ENCRYPTION_KEY`, `STATE_JWT_SECRET`, `PII_SALT` sinh mới (32 byte ngẫu nhiên). **Không đổi `PII_SALT` sau khi có dữ liệu** (sẽ vỡ thống kê khách quay lại).
- [ ] `NEXT_PUBLIC_DEMO_MODE=false`; không deploy `apps/mock-tiktok`.
- [ ] Postgres có backup; Redis có persistence (AOF) cho BullMQ.

## 3. Mục [CHƯA XÁC MINH] — kiểm với development shop / advertiser thật

| # | Cần kiểm | Cách kiểm | Nếu khác thì sửa ở |
|---|---|---|---|
| 1 | Thuật toán ký (01 §3) với API thật | Gọi `GET /authorization/202309/shops` | `packages/tiktok-client/src/shop/sign.ts` |
| 2 | Link uỷ quyền `services.tiktokshop.com/open/authorize?service_id=` | Thử uỷ quyền development shop | `TIKTOK_SHOP_AUTHORIZE_URL` |
| 3 | Thời hạn refresh token | Đọc `refresh_token_expire_in` | không cần sửa code (lưu theo giá trị trả về) |
| 4 | Tên trường `fee_tax_breakdown` (finance 202501) | Lấy 1 đơn đã quyết toán, so `raw` | `mappers/settlement.mapper.ts` |
| 5 | Tên metric report integrated (`complete_payment`, `total_complete_payment_rate`) | Gọi report 1 ngày, so với Ads Manager | `ADS_INTEGRATED_METRICS` trong tiktok-client |
| 6 | Tên metric GMV Max (`cost`, `orders`, `gross_revenue`) | Gọi `/gmv_max/report/get/` | `ADS_GMV_MAX_METRICS` |
| 7 | Giới hạn 30 ngày/lần report | Gọi khoảng 45 ngày | `ADS_REPORT_MAX_DAYS` |
| 8 | `store_id` == `shop_id`? | So `/gmv_max/store/list/` với `authorization/shops` | logic khớp ở `ads.entities` (đã có fallback store_code + chọn tay) |
| 9 | Mã lỗi Ads (40100, 40105…) | Gọi với token sai | `packages/tiktok-client/src/ads/errors.ts` |
| 10 | Rate limit thực tế | Theo dõi 36009002/40100 trong log tuần đầu | `TIKTOK_SHOP_RPS`, `TIKTOK_ADS_RPS` |
| 11 | `district_info` cấp tỉnh | Xem 1 đơn VN thật | `order.mapper.ts` |
| 12 | Webhook type 1 trạng thái `CANCEL` | Huỷ 1 đơn thử | `webhook normalize` |
| 13 | `open_id` giữ nguyên khi seller uỷ quyền lại | Uỷ quyền lại cùng tài khoản seller | `connections.service.ts completeShop` (khoá tài khoản khách) |
| 14 | Uỷ quyền từ App Store không có `state` | Cài app từ Seller Center App Store | kho chưa gán (`/admin/pool`) |
| 15 | Token BC DigiAds thấy tài khoản khách chia sẻ | Khách chia sẻ 1 tài khoản vào BC, gọi `/oauth2/advertiser/get/` | `completeAds` (agency) |
| 16 | `gmv_max_ad_fee_amount` có với shop VN, ở cấp nào | Shop bật tự trả GMV Max, xem `raw` của đối soát | `mapSettlement` |
| 17 | Dòng `GMV_PAYMENT_FOR_ADS` trong statement | Shop trả QC bằng số dư | `shop-sync.service.ts finance` |
| 18 | `gmv_breakdowns` của analytics 202509 | Gọi 1 ngày | `ShopClient.getShopPerformance` |
| 19 | `stat_time_day` theo múi giờ tài khoản QC; `stat_time_hour` cho GMV Max | So với Ads Manager | mốc đồng bộ chung (12 §4) |

## 4. Vận hành
- [ ] Dashboard theo dõi: số job lỗi theo resource, độ trễ đồng bộ (now − lastSuccessAt), số webhook nhận/ngày.
- [ ] Cảnh báo hệ thống tới admin khi một shop không đồng bộ được > 2 giờ.
- [ ] Chính sách lưu trữ: xoá dữ liệu shop 30 ngày sau khi seller huỷ uỷ quyền (webhook type 6) — yêu cầu của TikTok về dữ liệu.
