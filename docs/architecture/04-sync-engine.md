# 04 — Sync engine

Vị trí: `apps/api/src/sync/`. Hàng đợi BullMQ trên Redis (`REDIS_URL`). Scheduler dùng **repeatable jobs** của BullMQ (không dùng cron trong process riêng). Worker chạy cùng process API khi `SYNC_WORKER=true` (mặc định true ở dev; production có thể chạy process riêng bằng `node dist/worker.js`).

## 1. Cấu trúc

```
apps/api/src/sync/
  sync.module.ts
  queues.ts                 # tên queue + kiểu payload
  scheduler.service.ts      # đăng ký repeatable job theo từng shop/advertiser khi khởi động + khi kết nối mới
  sync-state.service.ts     # đọc/ghi SyncState, khoá chống chạy chồng
  client-factory.ts         # dựng ShopClient/AdsClient từ bản ghi DB (giải mã token, hook refresh)
  jobs/
    token-refresh.job.ts
    orders.job.ts
    products.job.ts
    returns.job.ts
    finance.job.ts
    analytics.job.ts
    ads-entities.job.ts
    ads-reports.job.ts
    rollup.job.ts
    alerts.job.ts
    reports.job.ts
  mappers/                  # wire → Prisma input, thuần hàm, có unit test
    order.mapper.ts  product.mapper.ts  return.mapper.ts  settlement.mapper.ts  ad-stat.mapper.ts
```

## 2. Queue và lịch

Một queue `sync` (concurrency 4) + queue `notify` (concurrency 2). JobId cố định theo `resource:scopeId` để BullMQ tự khử trùng job đang chờ.

| Job | Payload | Lịch mặc định (env ghi đè) | Mô tả |
|---|---|---|---|
| `token.refresh` | — | mỗi 60' | Refresh mọi `SellerAuthorization` ACTIVE có `accessExpiresAt < now + 24h` |
| `shop.orders` | `{shopId, mode: 'incremental'\|'backfill'\|'ids', ids?}` | 15' | §3 |
| `shop.products` | `{shopId, ids?}` | 60' | search theo `update_time_ge`; gọi detail cho id đổi |
| `shop.returns` | `{shopId}` | 30' | returns + cancellations theo `update_time_ge` |
| `shop.finance` | `{shopId}` | 6h | statements 30 ngày gần nhất; settlement cho đơn DELIVERED/COMPLETED chưa có `OrderSettlement` hoặc settlement < 7 ngày |
| `shop.analytics` | `{shopId}` | 6h | shop performance + product performance 7 ngày gần nhất |
| `ads.entities` | `{advertiserId}` | 60' | advertiser info, campaign/get, gmv_max/store/list → link khớp shop |
| `ads.reports` | `{advertiserId}` | 30' | §5 |
| `rollup.shop` | `{shopId, dates: string[]}` | theo sự kiện | §6 |
| `pnl.recompute` | `{shopId, fromDate, toDate?}` | sau mỗi rollup/sync QC/sửa chi phí + mỗi 30' cho 45 ngày gần nhất | `11-dashboard-metrics.md` §10 |
| `alerts.evaluate` | — | 5' | §7 |
| `reports.send` | — | mỗi ngày 08:00 Asia/Ho_Chi_Minh | §8 |

Khi tạo kết nối mới: đẩy ngay `shop.products` → `shop.orders{mode:'backfill'}` → `shop.returns` → `shop.finance` → `shop.analytics` (chuỗi bằng BullMQ Flow), rồi đăng ký lịch lặp.

## 3. Job `shop.orders`

```
state = SyncState(SHOP, shopId, 'orders')
if mode == 'backfill': from = now - BACKFILL_DAYS (30)  (dùng create_time)
else:                  from = state.cursor - 5 phút    (dùng update_time, chồng lấn để không sót)
to = now
page_token = null
loop:
  res = shop.searchOrders({ update_time_ge: from, update_time_lt: to }, { page_size: 50, page_token,
                          sort_field: 'update_time', sort_order: 'ASC' })
  trong 1 transaction: upsert Order theo (shopId, tiktokOrderId); xoá + tạo lại OrderLineItem của đơn đó
  touchedDates ∪= { businessDate cũ, businessDate mới }
  page_token = res.next_page_token; break nếu rỗng
state.cursor = to; state.lastSuccessAt = now; itemsLastRun = n
enqueue rollup.shop { shopId, dates: touchedDates }
```
Backfill dùng `create_time_ge` thay cho `update_time_ge`. Khoảng dài hơn 7 ngày cắt thành cửa sổ 7 ngày để tránh trang quá sâu.
Mode `ids`: `GET /order/202309/orders?ids=` theo lô 50.

## 4. Token và lỗi

`client-factory.ts` dựng `ShopClient` với hook `onTokenExpired`:
1. Lấy khoá advisory Postgres `pg_advisory_xact_lock(hash(sellerAuthorizationId))` để chỉ một worker refresh.
2. Đọc lại bản ghi (có thể worker khác vừa refresh) → nếu `accessExpiresAt > now + 5'` dùng token mới.
3. Ngược lại gọi `/api/v2/token/refresh`, lưu access + refresh mới (mã hoá), `lastRefreshedAt`.
4. Refresh thất bại → `status = NEEDS_REAUTH`, tạo `AlertInstance{kind:'AUTH_EXPIRING'}`, ném lỗi không retry.

Phân loại lỗi (từ `packages/tiktok-client`):

| Lỗi | Retry BullMQ? | SyncState |
|---|---|---|
| `RateLimitError`, `TransientError` | client đã backoff; nếu vẫn lỗi → BullMQ retry 3 lần (exp 30s) | ERROR + lastError |
| `TokenExpiredError` (sau refresh) | không | ERROR, auth NEEDS_REAUTH |
| `ScopeError` | không | BLOCKED |
| `SignatureError`, `ValidationError` | không | ERROR (bug, log mức error) |

Khoá chống chạy chồng: `SyncState.status = RUNNING` cập nhật có điều kiện (`WHERE status != 'RUNNING' OR lastStartedAt < now - 30')`).

## 5. Job `ads.reports`

```
for each Advertiser (isActive):
  range = [today_adv - 7, today_adv]   (lần đầu: today - BACKFILL_DAYS)
  # Nguồn 1: manual
  rows = ads.integratedReport(range, data_level=AUCTION_CAMPAIGN, dims=[campaign_id, stat_time_day])
         # client tự cắt ≤30 ngày/đoạn và tự phân trang page/page_size=1000
  upsert AdDailyStat(source=INTEGRATED) theo (campaignId, date, source)
    – campaign_id chưa có trong DB → tạo Campaign tạm kind=MANUAL, name=campaign_id (ads.entities sẽ cập nhật)
  # Nguồn 2: GMV Max
  for each AdvertiserStoreLink where isGmvMaxAvailable:
     rows = ads.gmvMaxReport(storeId, range, dims=[campaign_id, stat_time_day])
     upsert AdDailyStat(source=GMV_MAX, storeId)
enqueue rollup.shop cho các shop có link tới advertiser (để cập nhật cảnh báo ROAS)
```
Không xoá dòng cũ; upsert ghi đè (số liệu attribution thay đổi).

## 6. Rollup `rollup.shop`

Tính lại `ShopDailyStat` và `ProductDailyStat` cho từng ngày trong `dates` bằng SQL thuần (`prisma.$executeRaw`) trong 1 transaction, theo định nghĩa ở `03-data-model.md` §4. Ví dụ ShopDailyStat:

```sql
INSERT INTO "ShopDailyStat" (id, "shopId", date, gmv, orders, "unitsSold", buyers, "newBuyers",
  "cancelledOrders", "cancelledAmount", "returnRequests", "refundAmount", "codOrders", "sellerDiscount", "computedAt")
SELECT gen_random_uuid()::text, $1, $2::date,
  COALESCE(SUM(o."totalAmount") FILTER (WHERE valid), 0),
  COUNT(*) FILTER (WHERE valid),
  COALESCE((SELECT COUNT(*) FROM "OrderLineItem" li JOIN "Order" o2 ON o2.id = li."orderId"
            WHERE o2."shopId" = $1 AND o2."businessDate" = $2 AND NOT li."isGift"
              AND o2.status NOT IN ('UNPAID','CANCELLED') AND NOT o2."isSampleOrder"), 0),
  COUNT(DISTINCT o."buyerHash") FILTER (WHERE valid),
  COUNT(DISTINCT o."buyerHash") FILTER (WHERE valid AND NOT EXISTS (
      SELECT 1 FROM "Order" p WHERE p."shopId" = $1 AND p."buyerHash" = o."buyerHash" AND p."businessDate" < $2)),
  COUNT(*) FILTER (WHERE o.status = 'CANCELLED'),
  COALESCE(SUM(o."totalAmount") FILTER (WHERE o.status = 'CANCELLED'), 0),
  (SELECT COUNT(*) FROM "ReturnRequest" r WHERE r."shopId" = $1 AND r."businessDate" = $2 AND r.kind IN ('REFUND','RETURN_AND_REFUND')),
  (SELECT COALESCE(SUM(r."refundTotal"),0) FROM "ReturnRequest" r WHERE r."shopId" = $1 AND r."businessDate" = $2),
  COUNT(*) FILTER (WHERE valid AND o."isCod"),
  COALESCE(SUM(o."sellerDiscount") FILTER (WHERE valid), 0),
  now()
FROM (SELECT *, (status NOT IN ('UNPAID','CANCELLED') AND NOT "isSampleOrder") AS valid
      FROM "Order" WHERE "shopId" = $1 AND "businessDate" = $2) o
ON CONFLICT ("shopId", date) DO UPDATE SET ... = EXCLUDED....;
```
`pageViews`, `visitors`, `analyticsGmv` do `shop.analytics` ghi trực tiếp (không bị rollup ghi đè — rollup chỉ cập nhật các cột của nó).
`id` dùng `gen_random_uuid()` (Postgres 13+ có sẵn, không cần extension).

## 7. Cảnh báo `alerts.evaluate`

Rule JSON (giữ dạng v1, đổi danh sách metric):
```json
{
  "conditions": [{ "metric": "roas", "operator": "lt", "threshold": 1.5, "window": "24h" }],
  "logic": "AND",
  "actions": [{ "type": "email", "to": "owner@shop.vn" }, { "type": "telegram", "chatId": "-100123" }]
}
```
- metric: `gmv`, `orders`, `ad_spend`, `roas_tiktok`, `real_roas`, `real_roas_below_breakeven`, `net_profit`, `net_margin`, `cancel_rate`, `return_rate`, `aov` (lãi lỗ đọc `ShopDailyPnl`).
- operator: `lt`, `lte`, `gt`, `gte`. window: `today`, `24h`, `7d`.
- `today`/`7d` đọc từ bảng ngày; `24h` đọc thẳng `Order`/`AdDailyStat` (ad chỉ có độ phân giải ngày → `24h` của ad_spend = hôm nay + hôm qua × tỉ lệ giờ; ghi chú trong UI).
- Rule đang FIRING và điều kiện còn đúng → không tạo instance mới; hết đúng → RESOLVED.
- Gửi qua queue `notify`: email (SendGrid), Telegram (Bot API). Thiếu khoá (như ở demo) → chỉ log.

## 8. Báo cáo `reports.send`
Chạy 08:00 giờ VN. `ReportConfig` đến hạn (daily: mỗi ngày; weekly: `dayOfWeek` ISO 1–7 khớp hôm nay; monthly: `dayOfMonth`). Nội dung: GMV, đơn, chi QC, ROAS tổng, thực nhận, top 5 sản phẩm của kỳ trước. Cập nhật `lastSentAt` **sau** khi gửi thành công.

## 9. Webhook receiver

`apps/api/src/webhooks/tiktok-webhook.controller.ts`, route `POST /api/webhooks/tiktok`, `@Public()`.
- Cần raw body: bật `rawBody: true` trong `NestFactory.create`.
- Xác minh chữ ký (01 §11) bằng `verifyWebhookSignature()` của `packages/tiktok-client`; sai → 401.
- `INSERT ... ON CONFLICT (ttsNotificationId) DO NOTHING` → đã có thì trả 200 luôn.
- Tìm `Shop` theo `tiktokShopId` → đẩy job tương ứng (bảng ở 01 §11) → trả 200. Không làm việc nặng trong request.

## 10. Quan sát
- `GET /api/sync/status` trả mọi `SyncState` của tổ chức (UI Cài đặt → Kết nối).
- `POST /api/sync/run` `{scopeType, scopeId, resource}` — chạy ngay (nút "Đồng bộ ngay").
- Log JSON (pino) với `jobName`, `shopId`, `requestId` TikTok, `durationMs`, `items`.

## Vòng đồng bộ theo tổ chức (cập nhật)

Đơn hàng, hoàn/huỷ và báo cáo quảng cáo không còn lịch rời theo shop/advertiser: job `org.round` chạy lần lượt `orders → returns` của mọi shop rồi `ads.reports` của mọi advertiser trong tổ chức, ghi `SyncRound` làm mốc dữ liệu chung. Sản phẩm (60'), đối soát và analytics (360'), chiến dịch & store (60') giữ lịch riêng. Chi tiết: `12-accounts-and-access.md` §4. JobId BullMQ không chứa `:` (dùng `|`).
