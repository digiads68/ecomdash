# 07 — Mock TikTok server (apps/mock-tiktok)

Mục đích: cho phép chạy toàn bộ pipeline thật (OAuth → ký → sync → rollup → API → web) khi chưa có app TikTok. **Không** dùng trong production.

## 1. Công nghệ và cổng
- Fastify + TypeScript, chạy bằng `tsx`. Cổng `MOCK_TIKTOK_PORT=4010`.
- Import `signShopRequest`, `verifyWebhookSignature`, kiểu wire từ `@ecomdash/tiktok-client` — cùng mã với client để test hợp đồng có ý nghĩa.
- Dữ liệu giữ trong bộ nhớ, sinh tất định từ `MOCK_SEED` (mặc định `20261111`) khi khởi động. Khởi động lại = cùng dữ liệu (trừ đơn real-time).

Ba nhóm route trên cùng một cổng, phân biệt bằng tiền tố để base URL cấu hình như thật:

| Thật | Mock | Env trong api |
|---|---|---|
| `https://open-api.tiktokglobalshop.com` | `http://localhost:4010/shop` | `TIKTOK_SHOP_BASE_URL` |
| `https://auth.tiktok-shops.com` | `http://localhost:4010/shop-auth` | `TIKTOK_AUTH_BASE_URL` |
| `https://services.tiktokshop.com/open/authorize` | `http://localhost:4010/shop-auth/open/authorize` | `TIKTOK_SHOP_AUTHORIZE_URL` |
| `https://business-api.tiktok.com/open_api/v1.3` | `http://localhost:4010/ads/open_api/v1.3` | `TIKTOK_ADS_BASE_URL` |
| `https://business-api.tiktok.com/portal/auth` | `http://localhost:4010/ads/portal/auth` | `TIKTOK_ADS_AUTHORIZE_URL` |

Path sau tiền tố giống hệt API thật. Client ký trên **path sau base URL** (vd `/order/202309/orders/search`), mock bỏ tiền tố `/shop` trước khi xác minh.

## 2. Credential giả
`MOCK_APP_KEY=mock_app_key`, `MOCK_APP_SECRET=mock_app_secret`, `MOCK_ADS_APP_ID=mock_ads_app`, `MOCK_ADS_SECRET=mock_ads_secret`. `.env.example` đặt `TIKTOK_APP_KEY` … trùng các giá trị này.

## 3. Hành vi bắt buộc (để test hợp đồng có giá trị)

Shop API:
- Kiểm `app_key` (sai → 36009004), `timestamp` trong [−300s, +30s] (sai → 36009004), `sign` (sai → 106001).
- Endpoint theo shop: thiếu `shop_cipher` → 106013; cipher không thuộc token → 101000. `/authorization/*` có `shop_cipher` → 36009004.
- Header `x-tts-access-token`: không tồn tại → 36009004; hết hạn → 105002.
- Access token mock sống `MOCK_ACCESS_TTL_SEC` (mặc định 7 ngày; đặt 120 để thử luồng refresh).
- Phân trang `page_token` = base64url(`offset`), trả `next_page_token` rỗng ở trang cuối, `total_count`.
- Filter thời gian đúng ngữ nghĩa `_ge` (≥), `_lt` (<), `_le` (≤).
- `MOCK_FAULT_RATE` (mặc định 0): xác suất trả 36009002 để thử backoff.
- Tiền trả dạng chuỗi, thời gian Unix giây, envelope `{code, message, request_id, data}`.

Ads API:
- Header `Access-Token` kiểm như trên (sai → 40105).
- Report `stat_time_day` > 30 ngày → 40002. GMV Max `store_ids` khác 1 phần tử → 40002.
- Phân trang `page`/`page_size` với `page_info`.

Trang uỷ quyền:
- `GET /shop-auth/open/authorize?service_id&state` → trang HTML "Uỷ quyền EcomDash Demo truy cập Mỹ Phẩm Hoa Sen" với nút **Đồng ý** / **Từ chối** → redirect tới `MOCK_SHOP_REDIRECT_URI?code=...&state=...` (hoặc `error=auth_denied`).
- `GET /ads/portal/auth?app_id&state&redirect_uri` → tương tự, redirect `redirect_uri?auth_code=...&state=...`.
- Chế độ không giao diện cho script: `GET /__mock/auto-authorize?kind=shop|ads&state=` trả JSON `{code}`.

Webhook:
- `MOCK_WEBHOOK_URL` có giá trị → mỗi khi đơn mới/đổi trạng thái, POST envelope type 1 (ký đúng `Authorization`), mỗi `tts_notification_id` duy nhất; 5% gửi lặp để thử khử trùng.

Tiện ích dev:
- `GET /__mock/health`, `GET /__mock/state` (đếm bản ghi), `POST /__mock/tick` (sinh ngay 1 lô đơn mới), `POST /__mock/reset`.

## 4. Bộ sinh dữ liệu (`src/generator/`)

PRNG tất định (mulberry32) theo seed. Ngày kinh doanh theo `Asia/Ho_Chi_Minh`. Khoảng lịch sử: `MOCK_HISTORY_DAYS=60` ngày tính tới thời điểm khởi động.

**Seller & shop**
- Seller "Công ty TNHH Mỹ Phẩm Hoa Sen", `open_id` cố định.
- Shop 1: "Hoa Sen Beauty Official" (`code` VNLC…), ~250–600 đơn/ngày.
- Shop 2: "Hoa Sen Home & Living", ~60–150 đơn/ngày.
- Cả hai `region=VN`, `seller_type=LOCAL`, cipher dạng `ROW_xxxxxxxx`.

**Sản phẩm**: 28 SP cho shop 1 (mỹ phẩm: serum, kem chống nắng, son, toner, sữa rửa mặt…), 14 SP cho shop 2 (gia dụng). Tên tiếng Việt thực tế, 1–4 SKU/SP (dung tích/màu), giá 59.000–899.000 VND, tồn kho 0–2.000 (vài SKU < 10 để thấy cảnh báo). Phân phối bán theo Pareto (20% SP ~ 70% GMV). 2 SP `SELLER_DEACTIVATED`. Ảnh: data URI SVG sinh theo màu/tên (không phụ thuộc mạng).

**Đơn hàng**
- Số đơn/ngày = base × hệ số thứ (T7/CN ×1.35) × xu hướng (+0.4%/ngày) × nhiễu (±15%) × sự kiện (ngày đôi 9.9, 10.10, 11.11: ×3.2; ngày lương 25: ×1.3).
- Giờ đặt theo phân bố trong ngày (đỉnh 11–13h và 20–23h).
- 1–4 dòng/đơn (mỗi đơn vị một line item), voucher shop 0–15%, voucher sàn 0–10%, phí ship 0–30.000.
- 65% COD. Tỉnh/thành theo trọng số (TP.HCM 28%, Hà Nội 22%, Bình Dương, Đồng Nai, Đà Nẵng, Hải Phòng, Cần Thơ…).
- Người mua: pool 18.000 `user_id`; 30% đơn từ khách quay lại.
- Trạng thái theo tuổi đơn: <1h có thể UNPAID/ON_HOLD; <1 ngày AWAITING_SHIPMENT/AWAITING_COLLECTION; 1–4 ngày IN_TRANSIT; >3 ngày DELIVERED; >10 ngày COMPLETED. Huỷ 6% (lý do: "Người mua đổi ý", "Hết hàng", "Giao hàng trễ"…). `update_time` đổi khi trạng thái đổi → sync incremental thấy được.
- Real-time: mỗi `MOCK_TICK_SEC=60` giây sinh đơn mới theo nhịp giờ hiện tại và chuyển trạng thái đơn cũ.

**Hoàn/huỷ** (đủ lớn để thấy ROAS TikTok vs thực chênh rõ): huỷ 6–9% đơn đã thanh toán; 3–6% đơn đã giao có return; 20% return là hoàn một phần (1 trong nhiều đơn vị); return có `return_line_items` đúng số đơn vị; đơn hoàn có đối soát âm (phí ship hoàn 18.000–28.000₫). Cũ: 4% đơn đã giao có return (REFUND 40%, RETURN_AND_REFUND 55%, REPLACEMENT 5%), lý do thực tế ("Sản phẩm bị lỗi", "Không đúng mô tả", "Giao sai hàng"…). Cancellations tương ứng đơn CANCELLED.

**Tài chính**: đơn COMPLETED có settlement sau 3–7 ngày: hoa hồng sàn 4–6% (theo danh mục), phí giao dịch 4%, phí hạ tầng 3.000/đơn, hoa hồng affiliate 10–20% cho 25% đơn, phí ship seller chịu 0–15.000, VAT 1.5% TNCN/VAT hộ kinh doanh. Statement theo tuần (thứ Hai), PAID cho tuần đã qua, PROCESSING cho tuần hiện tại.

**Analytics**: page views ≈ đơn × 35–60, visitors ≈ page views × 0.6, GMV analytics = GMV thật × (1 ± 1%).

**Ads**
- Advertiser A "Hoa Sen Beauty — Ads" (VND, Asia/Ho_Chi_Minh) link shop 1 (store_id = shop_id). 6 chiến dịch thủ công (`PRODUCT_SALES`: "Serum C – Video Shopping", "Kem chống nắng – LIVE", …) + 2 GMV Max.
- Advertiser B "Hoa Sen Home — Ads" link shop 2, store_id **khác** shop_id nhưng `store_code` = `Shop.code` (để thử nhánh khớp bằng code). 3 thủ công + 1 GMV Max.
- Chi tiêu/ngày theo ngân sách × mức phân phối (70–100%), CPM 25.000–60.000, CTR 1–3.5%, CVR 1.5–4%; ROAS thủ công 1.2–5.5 tuỳ chiến dịch (1 chiến dịch ROAS < 1.5 để kích hoạt cảnh báo). GMV Max ROI 3–7 bám `roas_bid`. Một chiến dịch `DISABLE` 10 ngày gần nhất.
- Số liệu ads của 3 ngày gần nhất dao động nhẹ giữa các lần gọi (giả lập attribution trễ).

## 5. Cấu trúc thư mục
```
apps/mock-tiktok/
  package.json        # "dev": "tsx watch src/server.ts", "start": "tsx src/server.ts"
  src/
    server.ts
    config.ts
    store.ts          # dữ liệu trong bộ nhớ + chỉ mục
    generator/{rng.ts, catalog.ts, orders.ts, finance.ts, ads.ts, clock.ts}
    shop/{middleware.ts, authorization.ts, orders.ts, products.ts, finance.ts, returns.ts, analytics.ts, events.ts}
    shop-auth/{token.ts, authorize-page.ts}
    ads/{middleware.ts, oauth.ts, entities.ts, reports.ts, portal.ts}
    webhook-sender.ts
    dev-routes.ts
  test/contract.spec.ts   # chạy tiktok-client trên mock: chữ ký sai, thiếu cipher, phân trang, refresh
```
