# 01 — TikTok Shop Partner API (hợp đồng dùng trong EcomDash)

Nhãn nguồn: **[D]** đối chiếu với bản sao tài liệu chính thức partner.tiktokshop.com (phiên bản tới 202606) · **[S]** đối chiếu với SDK sinh từ spec chính thức · **[CHƯA XÁC MINH]** suy luận, phải kiểm với API thật.

Chỉ liệt kê những gì EcomDash dùng. `packages/tiktok-client` và `apps/mock-tiktok` phải bám đúng file này.

## 1. Host và phiên bản [D]

| Mục | Giá trị |
|---|---|
| API host | `https://open-api.tiktokglobalshop.com` (env `TIKTOK_SHOP_BASE_URL`) |
| Auth host (đổi/refresh token) | `https://auth.tiktok-shops.com` (env `TIKTOK_AUTH_BASE_URL`) |
| Link uỷ quyền (ngoài US) | `https://services.tiktokshop.com/open/authorize?service_id={SERVICE_ID}&state={state}` (env `TIKTOK_SHOP_AUTHORIZE_URL`) |
| Dạng path | `/{category}/{version}/{resource}`, version `YYYYMM` gán **theo từng API** |
| Sandbox | Không có từ 202309. Dùng "development shop" trong Seller Center (có cho thị trường VN) |

Phiên bản ghim trong hệ thống (đổi phải sửa cả client lẫn mock):

| API | Version |
|---|---|
| authorization/shops | 202309 |
| order search / detail | 202309 |
| product search / detail | 202309 |
| finance statements | 202309 |
| finance order transactions | **202501** (cấu trúc lồng, có `vn_fix_infrastructure_fee`) |
| return_refund returns / cancellations search | 202309 |
| analytics shop performance | 202405 |
| analytics shop_products performance | 202405 |
| event webhooks | 202309 |

## 2. Uỷ quyền (OAuth) [D]

1. App mở link uỷ quyền với `state` = JWT ngắn hạn ký bằng `INVITE_JWT_SECRET` chứa `{orgId, nonce, exp}`.
2. TikTok redirect về `TIKTOK_SHOP_REDIRECT_URI?code={auth_code}&state=...`. `auth_code` sống **30 phút, dùng 1 lần**. Seller từ chối → `code=null&error=auth_denied`.
3. Đổi code:
   ```
   GET {AUTH}/api/v2/token/get?app_key=&app_secret=&auth_code=&grant_type=authorized_code
   ```
   `data`: `access_token`, `access_token_expire_in`, `refresh_token`, `refresh_token_expire_in`, `open_id`, `seller_name`, `seller_base_region`, `user_type` (0 = seller), `granted_scopes[]`.
   **`*_expire_in` là Unix timestamp tuyệt đối (giây), không phải số giây còn lại.**
4. Refresh:
   ```
   GET {AUTH}/api/v2/token/refresh?app_key=&app_secret=&refresh_token=&grant_type=refresh_token
   ```
   Cùng cấu trúc trả về; **lưu cả refresh_token mới** (có thể thay đổi).
5. Thời hạn: access token ~7 ngày [D]. Refresh token ~1 năm **[CHƯA XÁC MINH]**. Webhook type 7 bắn mỗi ngày từ 30 ngày trước khi uỷ quyền hết hạn.
6. Token gửi qua header `x-tts-access-token`. API host auth (`/api/v2/token/*`) **không ký**.

Sau khi có token: gọi `GET /authorization/202309/shops` (không gửi `shop_cipher`) để lấy danh sách shop:

| Trường | Ý nghĩa |
|---|---|
| `id` | shop_id |
| `name` | Tên shop |
| `region` | `VN`, ... |
| `seller_type` | `LOCAL` \| `CROSS_BORDER` |
| `cipher` | shop_cipher — lưu vào `Shop.cipher` |
| `code` | Mã shop hiển thị (vd `VNLCxxxx`) |

## 3. Ký request [D]

Áp dụng cho mọi request tới API host (không áp dụng cho auth host).

Query chung: `app_key`, `timestamp` (Unix giây, chấp nhận từ −5 phút tới +30 giây so với giờ server), `sign`, và `shop_cipher` cho API theo shop.

Thuật toán:
```
1. params = mọi query param TRỪ "sign" và "access_token"
2. sắp xếp key tăng dần (A→Z)
3. s = path                                  // vd "/order/202309/orders/search"
4. với mỗi key: s += key + value             // value đã decode, không encode URL
5. nếu Content-Type != multipart/form-data: s += rawBody   // chuỗi JSON đúng từng byte sẽ gửi
6. s = app_secret + s + app_secret
7. sign = hex(HMAC_SHA256(key=app_secret, msg=s))          // chữ thường
```
Hệ quả triển khai: serialize body **một lần** thành chuỗi, ký chuỗi đó, gửi đúng chuỗi đó. Không để HTTP client tự serialize lại.

Test vector bắt buộc trong `packages/tiktok-client/src/shop/sign.spec.ts`: tự sinh bằng thuật toán trên với input cố định, đồng thời mock server dùng **cùng hàm** `signShopRequest()` từ package để xác minh — test hợp đồng sẽ phát hiện lệch.

## 4. Envelope và lỗi [D]

```json
{ "code": 0, "message": "Success", "request_id": "2026...", "data": { ... } }
```
`code != 0` là lỗi, kể cả khi HTTP 200.

| code | Ý nghĩa | Xử lý trong client |
|---|---|---|
| 0 | OK | |
| 105002 | Access token hết hạn | refresh 1 lần rồi gọi lại; thất bại → `TokenExpiredError` |
| 105005 | Thiếu scope | `ScopeError`, đánh dấu sync resource `BLOCKED` |
| 101000 | Token không khớp shop/cipher | `AuthMismatchError` |
| 106001 | Sai chữ ký | `SignatureError` (bug — không retry) |
| 106013 | Thiếu shop_cipher | `SignatureError` |
| 36009002 | Quá tần suất | backoff mũ (1s,2s,4s…≤60s, tối đa 6 lần) |
| 36009007 | Timeout | retry như trên |
| 36009004 | Sai credential/timestamp/tham số thừa | không retry |
| 36009033 | IP không nằm trong allowlist | không retry, báo cấu hình |
| HTTP 429/5xx | | retry như 36009002 |

Rate limit cụ thể **[CHƯA XÁC MINH]** — client giới hạn mặc định 5 req/s/shop (token bucket, cấu hình `TIKTOK_SHOP_RPS`).

## 5. Quy ước dữ liệu [D/S]

- Trường snake_case. Tiền là **chuỗi** (`"125000"`), kèm `currency` (`VND`).
- Thời gian là Unix giây (UTC). Riêng analytics dùng ngày `YYYY-MM-DD` theo múi giờ shop.
- Phân trang: `page_size` + `page_token` ở **query**; filter ở **body JSON** (với endpoint POST search). Trả `next_page_token` (rỗng = hết) và `total_count`.

## 6. Đơn hàng

### 6.1 Search — `POST /order/202309/orders/search` [D]
Query: `page_size` (1–100; hệ thống dùng 50), `page_token`, `sort_field` (`create_time`|`update_time`), `sort_order` (`ASC`|`DESC`), `shop_cipher`.
Body (đều tuỳ chọn): `order_status`, `create_time_ge`, `create_time_lt`, `update_time_ge`, `update_time_lt`, `shipping_type`, `buyer_user_id`, `is_buyer_request_cancel`, `warehouse_ids`.
Trả: `data.orders[]` (cấu trúc như detail), `data.next_page_token`, `data.total_count`.
EcomDash sync tăng dần: `sort_field=update_time`, `sort_order=ASC`, body `{update_time_ge, update_time_lt}`.

### 6.2 Detail — `GET /order/202309/orders?ids=a,b,c` [D]
Tối đa 50 id. Dùng khi webhook báo một đơn đổi trạng thái.

### 6.3 Enum trạng thái đơn [D]
`UNPAID` · `ON_HOLD` · `AWAITING_SHIPMENT` · `PARTIALLY_SHIPPING` · `AWAITING_COLLECTION` · `IN_TRANSIT` · `DELIVERED` · `COMPLETED` · `CANCELLED`

Webhook type 1 dùng `CANCEL` thay cho `CANCELLED` và không có `PARTIALLY_SHIPPING` → chuẩn hoá trước khi lưu.

Nhóm hiển thị trên UI:

| Nhóm UI | Trạng thái |
|---|---|
| Chờ thanh toán | UNPAID |
| Chờ xử lý | ON_HOLD, AWAITING_SHIPMENT, PARTIALLY_SHIPPING, AWAITING_COLLECTION |
| Đang giao | IN_TRANSIT |
| Đã giao | DELIVERED, COMPLETED |
| Đã huỷ | CANCELLED |
| Hoàn/trả | không phải trạng thái đơn — lấy từ Returns API (§9) |

### 6.4 Trường đơn dùng trong hệ thống [D]
- Định danh/thời gian: `id`, `status`, `create_time`, `update_time`, `paid_time`, `rts_time`, `delivery_time`, `collection_time`, `cancel_time`, `cancel_reason`, `cancellation_initiator`.
- Người mua: `user_id` (→ `buyerHash`), `recipient_address.district_info[]` (lấy cấp tỉnh/thành → `province`). Không lưu `name`, `phone_number`, `full_address`.
- Giao vận: `shipping_provider`, `shipping_type`, `delivery_option_name`, `tracking_number`, `is_cod`, `payment_method_name`.
- Cờ: `is_sample_order` (không tính GMV), `is_replacement_order`, `is_exchange_order`.
- `payment`: `currency`, `sub_total`, `shipping_fee`, `seller_discount`, `platform_discount`, `total_amount`, `original_total_product_price`, `original_shipping_fee`, `shipping_fee_seller_discount`, `shipping_fee_platform_discount`, `tax`.
- `line_items[]` (**mỗi phần tử = 1 đơn vị**, 3 cái cùng SKU → 3 dòng): `id`, `product_id`, `product_name`, `sku_id`, `sku_name`, `sku_image`, `seller_sku`, `original_price`, `sale_price`, `seller_discount`, `platform_discount`, `display_status`, `package_id`, `is_gift`.

## 7. Sản phẩm

### 7.1 Search — `POST /product/202309/products/search` [D]
Query: `page_size` (1–100), `page_token`, `shop_cipher`. Body: `status` (mặc định `ALL`), `seller_skus`, `create_time_ge`/`create_time_le`, `update_time_ge`/`update_time_le` (**`_le`, không phải `_lt`**).
Item: `id`, `title`, `status`, `create_time`, `update_time`, `skus[]` {`id`, `seller_sku`, `price{currency, sale_price, tax_exclusive_price}`, `inventory[]{warehouse_id, quantity}`}.

Enum trạng thái: `DRAFT`, `PENDING`, `FAILED`, `ACTIVATE`, `SELLER_DEACTIVATED`, `PLATFORM_DEACTIVATED`, `FREEZE`, `DELETED`.

### 7.2 Detail — `GET /product/202309/products/{product_id}` [D]
Thêm: `main_images[]{uri, urls[]}` (lấy `urls[0]` làm thumbnail), `category_chains[]`, `brand`, `skus[].sales_attributes[]{name, value_name}`, `skus[].list_price`.
Chỉ gọi detail cho sản phẩm có `update_time` thay đổi.

## 8. Tài chính

### 8.1 Statements — `GET /finance/202309/statements` [D]
Query: `sort_field=statement_time` (bắt buộc), `statement_time_ge`, `statement_time_lt`, `payment_status` (`PAID`|`FAILED`|`PROCESSING`), `page_size`, `page_token`, `shop_cipher`.
Item [S]: `id`, `statement_time`, `settlement_amount`, `revenue_amount`, `fee_amount`, `adjustment_amount`, `shipping_cost_amount`, `net_sales_amount`, `currency`, `payment_status`, `payment_id`.

### 8.2 Giao dịch theo đơn — `GET /finance/202501/orders/{order_id}/statement_transactions` [D]
Trả `statement_transactions[]`, mỗi phần tử: `revenue_amount`, `fee_tax_amount`, `shipping_cost_amount`, `settlement_amount`, `sku_transactions[]` với:
- `revenue_breakdown` {`subtotal_before_discount_amount`, `seller_discount_amount`, `refund_subtotal_after_seller_discounts_amount`, ...}
- `shipping_cost_breakdown` {`actual_shipping_fee_amount`, `customer_paid_shipping_fee_amount`, `platform_shipping_fee_discount_amount`, ...}
- `fee_tax_breakdown.fee` {`platform_commission_amount`, `referral_fee_amount`, `transaction_fee_amount`, `affiliate_commission_amount`, `affiliate_ads_commission_amount`, `sfp_service_fee_amount`, `vn_fix_infrastructure_fee_amount`, ...}
- `fee_tax_breakdown.tax` {`vat_amount`, ...}

Tên trường con trong `*_breakdown` **[CHƯA XÁC MINH từng tên]** — client giữ nguyên JSON trong `OrderSettlement.raw` và chỉ trích các tổng đã xác minh (`revenue_amount`, `fee_tax_amount`, `shipping_cost_amount`, `settlement_amount`) cùng các phí ở trên vào cột riêng; phí không nhận ra cộng vào `otherFees`.

### 8.3 Ước tính chưa quyết toán — `GET /finance/202507/orders/unsettled` [D]
Chỉ dùng ở giai đoạn sau (hiển thị "dự kiến thực nhận"). Không có trong MVP.

## 9. Hoàn/huỷ [D]

- `POST /return_refund/202309/returns/search` — query `page_size` (10–50), `page_token`; body `order_ids`, `return_status`, `return_types` (`REFUND`|`RETURN_AND_REFUND`|`REPLACEMENT`), `create_time_ge/lt`, `update_time_ge/lt`.
  Item: `return_id`, `order_id`, `return_type`, `return_status`, `return_reason`, `refund_amount{currency, refund_total, refund_subtotal, refund_shipping_fee}`, `return_line_items[]`, `create_time`, `update_time`.
  `return_status`: `RETURN_OR_REFUND_REQUEST_PENDING`, `REFUND_OR_RETURN_REQUEST_REJECT`, `AWAITING_BUYER_SHIP`, `BUYER_SHIPPED_ITEM`, `REJECT_RECEIVE_PACKAGE`, `RETURN_OR_REFUND_REQUEST_SUCCESS`, `RETURN_OR_REFUND_REQUEST_CANCEL`, `RETURN_OR_REFUND_REQUEST_COMPLETE`, `AWAITING_BUYER_RESPONSE`.
- `POST /return_refund/202309/cancellations/search` — tương tự; `cancel_types` `CANCEL`|`BUYER_CANCEL`; `cancel_status` `CANCELLATION_REQUEST_PENDING|_SUCCESS|_CANCEL|_COMPLETE`.

## 10. Analytics [D]

`GET /analytics/202405/shop/performance?start_date_ge=YYYY-MM-DD&end_date_lt=YYYY-MM-DD&granularity=1D&currency=LOCAL&shop_cipher=`
Trả `performance.intervals[]`: `start_date`, `end_date`, `gmv{amount, currency}`, `orders`, `sku_orders`, `units_sold`, `buyers`, `avg_order_value`, `product_impressions`, `product_page_views`, `avg_product_page_visitors`, `refunds`, `cancellations_and_returns`.

Dùng để: (a) lấy **lượt xem/visitor** (không có từ đơn hàng) cho `ShopDailyStat`; (b) đối chiếu GMV tự tính — lệch >2% thì ghi cảnh báo vào `SyncState.lastWarning`. GMV hiển thị **luôn tính từ Order** để khớp với danh sách đơn.

`GET /analytics/202405/shop_products/performance` — theo sản phẩm: `id`, `gmv`, `orders`, `units_sold`, `click_through_rate`, `impressions`, `page_views` → `ProductDailyStat.pageViews/impressions`.

## 11. Webhook [D]

Envelope:
```json
{ "type": 1, "tts_notification_id": "7327...", "shop_id": "7494...", "timestamp": 1731500000, "data": { ... } }
```
Xác minh: header `Authorization` = `hex(HMAC_SHA256(key=app_secret, msg=app_key + rawBody))`. Sai → trả 401.
Phải trả 200 trong **3 giây**; TikTok retry sau +2', +30', +3h, +12h rồi bỏ. Khử trùng theo `tts_notification_id`.
Đăng ký qua Partner Center hoặc `PUT /event/202309/webhooks` (body `{address, event_type}`).

| type | Sự kiện | Hành động EcomDash |
|---|---|---|
| 1 | Đổi trạng thái đơn (`order_id`, `order_status`, `update_time`) | job `orders.fetch-by-ids` |
| 4 | Cập nhật kiện hàng | job `orders.fetch-by-ids` |
| 5 / 15 / 16 | Sản phẩm đổi trạng thái / thông tin / tạo mới | job `products.fetch-by-ids` |
| 6 | Seller huỷ uỷ quyền | `SellerAuthorization.status = REVOKED`, dừng sync |
| 7 | Uỷ quyền sắp hết hạn (`expiration_time`) | cập nhật `authExpiresAt`, tạo AlertInstance hệ thống |
| 11 | Đổi trạng thái huỷ | job `returns.sync` cho shop |
| 12 | Đổi trạng thái hoàn | job `returns.sync` cho shop |
| khác | | lưu `WebhookEvent`, bỏ qua |
