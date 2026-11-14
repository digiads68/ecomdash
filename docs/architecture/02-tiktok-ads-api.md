# 02 — TikTok Marketing API v1.3 (Shop Ads + GMV Max)

Nhãn nguồn: **[V]** đối chiếu với spec trong SDK chính thức `tiktok/tiktok-business-api-sdk` · **[CHƯA XÁC MINH]** từ hiểu biết chung, phải kiểm với API thật (cổng tài liệu business-api.tiktok.com bị chặn trong phiên nghiên cứu).

## 1. Host, header, envelope

| Mục | Giá trị |
|---|---|
| Base | `https://business-api.tiktok.com/open_api/v1.3` (env `TIKTOK_ADS_BASE_URL`) — mọi path kết thúc bằng `/` [V] |
| Link uỷ quyền | `https://business-api.tiktok.com/portal/auth?app_id={APP_ID}&state={state}&redirect_uri={uri}` [CHƯA XÁC MINH] (env `TIKTOK_ADS_AUTHORIZE_URL`) |
| Token | header `Access-Token: {token}` |
| Envelope | `{code, message, request_id, data}`; `code=0` là OK [V] |
| Tham số GET dạng mảng/đối tượng | JSON-encode vào query, vd `metrics=["spend","impressions"]` |
| Không ký request | Marketing API không dùng HMAC như Shop API |

## 2. Uỷ quyền

- `POST /oauth2/access_token/` body `{app_id, secret, auth_code}` [V] → `data.access_token`, `data.advertiser_ids[]`, `data.scope[]`.
- Token advertiser **dài hạn, không có refresh** — chỉ mất hiệu lực khi bị thu hồi [CHƯA XÁC MINH]. Lỗi 40105/40102 → `AdsAuthorization.status = NEEDS_REAUTH`.
- `GET /oauth2/advertiser/get/?app_id=&secret=` [V] → `data.list[]{advertiser_id, advertiser_name}`.

## 3. Thực thể

### 3.1 `GET /advertiser/info/?advertiser_ids=["..."]` [V]
Trường dùng: `advertiser_id`, `name`, `currency` (`VND`), `timezone` (vd `Asia/Ho_Chi_Minh` hoặc `Etc/GMT-7`), `status`, `owner_bc_id`, `balance`.
**Ngày báo cáo tính theo múi giờ advertiser** → lưu `Advertiser.timezone`, rollup theo đó.

### 3.2 `GET /campaign/get/?advertiser_id=&page=&page_size=` [V]
Phân trang `page` (từ 1), `page_size` ≤ 1000; trả `data.list[]`, `data.page_info{page, page_size, total_number, total_page}`.
Trường: `campaign_id`, `campaign_name`, `objective_type` (Shop Ads: `PRODUCT_SALES`), `budget`, `budget_mode` (`BUDGET_MODE_DAY`|`BUDGET_MODE_TOTAL`|`BUDGET_MODE_INFINITE`), `operation_status` (`ENABLE`|`DISABLE`), `secondary_status`, `campaign_type`, `create_time`, `modify_time`.

### 3.3 GMV Max campaign
- `GET /campaign/gmv_max/info/?advertiser_id=&campaign_id=` [V] → `store_id`, `store_authorized_bc_id`, `shopping_ads_type`, `budget`, `roas_bid`, `operation_status`, `optimization_goal`.
- Phân biệt: chiến dịch xuất hiện trong `/gmv_max/report/get/` hoặc có `campaign_type`/`objective_type` GMV Max → `Campaign.kind = GMV_MAX`; còn lại `MANUAL`.

### 3.4 Liên kết advertiser ↔ shop — `GET /gmv_max/store/list/?advertiser_id=` [V]
`data.store_list[]`: `store_id`, `store_name`, `store_code`, `store_status`, `store_authorized_bc_id`, `store_role`, `is_owner_bc`, `is_gmv_max_available`, `targeting_region_codes`, `thumbnail_url`.
→ upsert `AdvertiserStoreLink(advertiserId, storeId, storeAuthorizedBcId)`.

**Khớp `store_id` với Shop** [CHƯA XÁC MINH rằng `store_id == shop_id`]. Thứ tự khớp:
1. `store_id == Shop.tiktokShopId` trong cùng tổ chức.
2. Không khớp → `store_code == Shop.code`.
3. Vẫn không → để `shopId = null`, UI Cài đặt → Kết nối cho người dùng chọn tay.

Quan hệ nhiều–nhiều: một shop có thể được nhiều advertiser chạy, một advertiser chạy nhiều shop.

## 4. Báo cáo

### 4.1 Manual Shop Ads — `GET /report/integrated/get/` [V]
```
report_type=BASIC
data_level=AUCTION_CAMPAIGN
dimensions=["campaign_id","stat_time_day"]
metrics=[...]
start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
page=1&page_size=1000
advertiser_id=...
```
`report_type` hợp lệ [V]: `BASIC, AUDIENCE, PLAYABLE_MATERIAL, CATALOG, BC, TT_SHOP`.

Metric yêu cầu (tên **[CHƯA XÁC MINH]** — client cấu hình được danh sách, mock trả đúng các tên này):

| Metric API | Cột `AdDailyStat` |
|---|---|
| `spend` | `spend` |
| `impressions` | `impressions` |
| `clicks` | `clicks` |
| `conversion` | `conversions` |
| `complete_payment` (số đơn) | `orders` |
| `total_complete_payment_rate` (giá trị mua — tên gây nhầm nhưng là doanh thu) | `grossRevenue` |

Trả `data.list[]{dimensions{campaign_id, stat_time_day}, metrics{...: string}}`, `data.page_info`.
Giới hạn: `stat_time_day` tối đa **30 ngày/lần** [CHƯA XÁC MINH] → client tự cắt khoảng thành các đoạn ≤30 ngày.
Số liệu bị điều chỉnh trễ do attribution → **mỗi lần sync kéo lại 7 ngày gần nhất** và upsert.

### 4.2 GMV Max — `GET /gmv_max/report/get/` [V]
Bắt buộc: `advertiser_id`, `store_ids` (**đúng 1 phần tử**), `dimensions` (≤3), `metrics` (≤100), `start_date`, `end_date`. Tuỳ chọn: `filtering{campaign_ids, gmv_max_promotion_types: PRODUCT|LIVE, ...}`, `page`, `page_size` (≤1000).
Dimensions dùng: `["campaign_id","stat_time_day"]`.
Metrics: `cost`, `net_cost`, `orders`, `cost_per_order`, `gross_revenue`, `roi` (tên **[CHƯA XÁC MINH]** ngoài cấu trúc request).
→ `AdDailyStat` với `source = GMV_MAX`, `spend = cost`, `orders`, `grossRevenue = gross_revenue`.

**Quan trọng:** doanh thu/đơn GMV Max **gồm cả organic** (TikTok tự quy) → không cộng `grossRevenue` GMV Max vào GMV shop, không gộp với ROAS thủ công. UI hiển thị riêng "ROI GMV Max (do TikTok tính, gồm organic)". `net_cost` có thể trễ ~11 giờ.

## 5. Lỗi [CHƯA XÁC MINH mã cụ thể]

| code | Ý nghĩa | Xử lý |
|---|---|---|
| 40100 | Quá tần suất | backoff mũ, tối đa 6 lần |
| 40001 | Không có quyền | `ScopeError` |
| 40002 | Sai tham số | lỗi lập trình, không retry |
| 40102 / 40104 / 40105 | Token hết hạn / rỗng / sai | `NEEDS_REAUTH` |
| 40300 | Không được uỷ quyền advertiser này | gỡ advertiser khỏi danh sách đồng bộ |
| 50000, 51xxx | Lỗi server | retry |

Rate limit mặc định client: 10 req/s/app (`TIKTOK_ADS_RPS`).

## 6. Tiền tệ, múi giờ

- Tiền trả dạng chuỗi hoặc số theo `currency` của advertiser (cố định khi tạo tài khoản). Lưu `Decimal(18,2)`.
- Nếu `Advertiser.currency != Shop.currency` (hiếm ở VN) → không tính ROAS tổng, UI báo "khác tiền tệ".
- `stat_time_day` là ngày theo múi giờ advertiser; mặc định coi như ngày kinh doanh của shop khi cùng `Asia/Ho_Chi_Minh`.

## 7. Webhook
Marketing API không có webhook chi tiêu/báo cáo → chỉ polling.
