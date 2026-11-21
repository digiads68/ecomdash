# 05 — Hợp đồng REST API (apps/api ↔ apps/web)

- Prefix toàn cục `/api`. `NEXT_PUBLIC_API_URL=http://localhost:4000` (**không** kèm `/api`; `api-client.ts` tự thêm).
- JSON. Tiền trả về dạng **number** (VND, đã làm tròn) để web dùng `formatVND()` trực tiếp. Ngày trả `YYYY-MM-DD` (ngày kinh doanh) hoặc ISO 8601 cho thời điểm.
- DTO đặt trong `packages/shared/src/dto/*.ts`, cả api lẫn web import từ `@ecomdash/shared`.
- Tham số chung cho route phân tích:
  - `shopId` — `Shop.id` (cuid). Bắt buộc trừ khi ghi chú. Service kiểm `shop.organizationId === req.orgId`, sai → 404.
  - `from`, `to` — `YYYY-MM-DD`, **bao gồm cả hai đầu**, theo ngày kinh doanh. Mặc định 30 ngày gần nhất tới hôm nay. Tối đa 366 ngày.
  - So sánh kỳ trước: cùng độ dài, liền trước `from`.
- Lỗi: `{ statusCode, message, error }` chuẩn NestJS.

## 1. Xác thực

Phiên cookie `ecomdash_session` (hoặc `Authorization: Bearer`) do API cấp; `AuthGuard` gắn `req.user`, `req.access` (quyền, `12-accounts-and-access.md` §2, §6). Route không có phiên → 401.

`GET /api/me` → `MeDto { user: {id, name, email, hasPassword, tiktokLinked}, platformRole, organizations: [{id, name, role, canEdit, status: OrgLinkStatus}], demo }`.

| Route | Mô tả |
|---|---|
| `POST /auth/login` `{email, password}` | đặt cookie, trả `MeDto`; sai 5 lần / 15' → 401 khoá tạm |
| `POST /auth/logout`, `POST /auth/sessions/revoke-others` | |
| `GET /auth/tiktok/start` | redirect trang uỷ quyền TikTok Shop (`state intent=login`) |
| `POST /auth/password` `{email?, currentPassword?, newPassword}` | đặt/đổi email + mật khẩu |
| `GET /auth/invitations/:token`, `POST /auth/invitations/accept` `{token, name?, password}` | lời mời |
| `GET /auth/demo-accounts` | chỉ khi `DEMO_MODE=true` |

Tham số phạm vi: route theo shop nhận `shopId` (ngoài phạm vi → 404, chỉ xem mà sửa → 403); route theo tổ chức (kết nối, cảnh báo, báo cáo, đồng bộ, billing) nhận `orgId` (query), bỏ trống = tổ chức duy nhất của người dùng.

`GET /shops` → shop xem được: `ShopDto { …, organizationId, organizationName, canEdit }`.

## 2. Kết nối

| Method | Path | Mô tả |
|---|---|---|
| GET | `/connections` | `ConnectionsDto` (dưới) |
| GET | `/connections/shop/authorize-url` | `{ url }` — link uỷ quyền TikTok Shop (demo → link trang uỷ quyền của mock) |
| GET | `/connections/shop/callback?code&state` | `@Public`. Xác minh `state`, đổi token, lấy shops, tạo `SellerAuthorization` + `Shop`, kiểm `checkShopLimit()`, khởi chạy backfill, redirect `APP_URL/settings/connections?connected=shop` |
| GET | `/connections/ads/authorize-url` | `{ url }` |
| GET | `/connections/ads/callback?auth_code&state` | `@Public`. Tương tự cho Ads |
| PATCH | `/connections/shops/:id` | `{ isActive }` bật/tắt đồng bộ |
| PATCH | `/connections/store-links/:id` | `{ shopId }` khớp tay advertiser ↔ shop |
| DELETE | `/connections/seller-authorizations/:id` | Gỡ kết nối (xoá cascade dữ liệu shop) |
| GET | `/sync/status` | `SyncStateDto[]` |
| POST | `/sync/run` | `{ scopeType, scopeId, resource }` |

```ts
interface ConnectionsDto {
  sellerAuthorizations: { id; sellerName; status: 'ACTIVE'|'NEEDS_REAUTH'|'REVOKED'; accessExpiresAt; refreshExpiresAt;
    shops: { id; name; code; region; isActive; lastOrderSyncAt: string|null }[] }[];
  adsAuthorizations: { id; status; advertisers: { id; name; currency; timezone;
    storeLinks: { id; storeId; storeName; shopId: string|null; matchedBy: string|null }[] }[] }[];
  plan: { name: 'STARTER'|'PRO'|'ENTERPRISE'; maxShops: number|null; usedShops: number };
}
```

## 3. Shop và tổng quan

`GET /shops` → `{ id, name, code, region, currency, timezone }[]` (shop đang active của tổ chức — dùng cho shop switcher).

Trang chủ dùng `GET /pnl/summary` + `GET /pnl/daily` (`11-dashboard-metrics.md` §11). `/overview` dưới đây chỉ còn cho khối vận hành (phễu trạng thái, top sản phẩm).

`GET /overview?shopId&from&to`
```ts
interface OverviewDto {
  kpis: {
    gmv: Kpi; orders: Kpi; aov: Kpi; adSpend: Kpi; roas: Kpi; settlement: Kpi; estimatedProfit: Kpi;
    cancelRate: Kpi; returnRate: Kpi; newBuyers: Kpi;
  };                                    // Kpi = { value: number; previous: number; changePct: number|null }
  daily: { date: string; gmv: number; orders: number; adSpend: number; roas: number|null }[];
  statusFunnel: { group: 'PENDING_PAYMENT'|'TO_SHIP'|'SHIPPING'|'DELIVERED'|'CANCELLED'; count: number }[];
  topProducts: { productId; title; thumbnailUrl; gmv; unitsSold; orders }[];   // top 5 theo GMV
  syncedAt: string | null;              // min(lastSuccessAt) của orders/ads_reports
}
```

## 4. Đơn hàng

`GET /orders?shopId&from&to&status?&q?&page=1&pageSize=25&sort=createTime:desc`
- `status`: một nhóm UI (`TO_SHIP`…) hoặc trạng thái gốc.
- `q`: tìm theo `tiktokOrderId` hoặc `trackingNumber` (prefix).
```ts
interface OrderListDto { items: OrderRowDto[]; total: number; page: number; pageSize: number;
  statusCounts: Record<UiStatusGroup, number> }
interface OrderRowDto { id; tiktokOrderId; createTime; status; statusGroup; totalAmount; itemCount;
  firstItem: { productName; skuName; skuImage }; province; isCod; shippingProvider; settlementAmount: number|null }
```
`GET /orders/:id` → `OrderDetailDto`: mọi trường `Order`, `lineItems` gộp theo SKU (`quantity`), `settlement` (breakdown phí), `returns[]`, `timeline[]` (create/paid/rts/delivery/cancel).
`GET /orders/daily?shopId&from&to` → `{ date, orders, cancelled, gmv }[]`.

## 5. Sản phẩm

`GET /products?shopId&from&to&sort=gmv|unitsSold|orders|conversion&status?&q?&page&pageSize`
```ts
interface ProductRowDto { id; tiktokProductId; title; thumbnailUrl; status; skuCount; inventory;
  minPrice; maxPrice; gmv; unitsSold; orders; pageViews: number|null; conversionRate: number|null;
  returnRate: number|null; gmvChangePct: number|null }
```
`GET /products/:id?from&to` → chi tiết + `skus[]` (giá, tồn, đã bán theo SKU) + `daily[]`.

## 6. Tài chính

> Lợi nhuận ở trang Tài chính lấy từ `/pnl/summary` (cùng nguồn với trang chủ). `/finance/*` chỉ còn đối soát/kỳ thanh toán.

`GET /finance/summary?shopId&from&to`
```ts
interface FinanceSummaryDto {
  gmv; revenue; settlement;                      // revenue = Σ revenueAmount đối soát
  fees: { platformCommission; transactionFee; affiliateCommission; infrastructureFee; shippingCost; otherFees; tax };
  adSpend; cogs; packaging; estimatedProfit; marginPct;
  settledOrders: number; unsettledOrders: number; // đơn hợp lệ đã/chưa có OrderSettlement
  waterfall: { label: string; amount: number }[]; // GMV → … → Lợi nhuận, cho biểu đồ thác nước
}
```
`GET /finance/statements?shopId&from&to` → `{ id, statementTime, revenueAmount, feeAmount, adjustmentAmount, shippingCostAmount, settlementAmount, paymentStatus }[]`.
`GET /finance/settlements?shopId&from&to&page&pageSize` → theo đơn: `{ orderId, tiktokOrderId, createTime, gmv, revenueAmount, totalFees, settlementAmount, settledAt }`.
`GET|PUT /shops/:id/config` → `{ cogsPercent, packagingCostPerOrder }`.

## 7. Quảng cáo

`GET /ads/overview?shopId&from&to`
```ts
interface AdsOverviewDto {
  totals: { spend: Kpi; impressions: Kpi; clicks: Kpi; ctr: Kpi; cpc: Kpi; roasTotal: Kpi };
  manual:  { spend; orders; grossRevenue; roas: number|null };
  gmvMax:  { spend; orders; grossRevenue; roi: number|null };   // UI ghi chú: gồm organic
  daily: { date; manualSpend; gmvMaxSpend; gmv; roasTotal: number|null }[];
  budgetForecast: { monthToDateSpend; projectedMonthSpend; daysElapsed; daysInMonth };
  allocation: 'DIRECT' | 'PROPORTIONAL';   // PROPORTIONAL khi advertiser chạy cho nhiều shop
}
```
`GET /ads/campaigns?shopId&from&to&kind?=MANUAL|GMV_MAX` — mỗi dòng có thêm `roasTiktok`, `realRoasEstimated`, `vsBreakEven: 'PROFIT'|'NEAR_BREAKEVEN'|'LOSS'`
```ts
interface CampaignRowDto { id; tiktokCampaignId; name; kind; advertiserName; operationStatus; budget: number|null;
  budgetMode: string|null; roasBid: number|null; spend; impressions; clicks; ctr: number|null; cpc: number|null;
  conversions; orders; grossRevenue; roas: number|null }
```
`GET /ads/campaigns/:id/daily?from&to` → `{ date, spend, impressions, clicks, orders, grossRevenue }[]`.

## 8. Hoàn / huỷ

`GET /returns/summary?shopId&from&to` → `{ returnRate: Kpi; cancelRate: Kpi; refundAmount: Kpi; byReason: {reason, count}[]; byKind: {kind, count}[]; daily: {date, returns, cancellations, refundAmount}[] }`
`GET /returns?shopId&from&to&kind?&status?&page&pageSize` → `{ id, tiktokReturnId, tiktokOrderId, kind, status, reason, refundTotal, createTime }[]`.

## 9. Khách hàng (không PII)

`GET /customers/summary?shopId&from&to` → `{ buyers: Kpi; newBuyers: Kpi; returningRate: Kpi; avgOrdersPerBuyer; segments: { name: 'Mới'|'Quay lại'|'Trung thành'; buyers; gmv }[]; topProvinces: {province, orders, gmv}[] }`
`GET /customers/cohorts?shopId&months=6` → ma trận giữ chân theo tháng mua đầu.

## 10. Cảnh báo, báo cáo, xuất file

Giữ route v1 (đổi tên metric theo 04 §7):
- `GET|POST /alerts/rules`, `PUT|DELETE /alerts/rules/:id`
- `GET /alerts/instances?state=FIRING|RESOLVED`, `POST /alerts/instances/:id/acknowledge`
- `GET|POST /reports/configs`, `PUT|DELETE /reports/configs/:id`
- `GET /export?type=orders|products|campaigns|settlements&shopId&from&to&format=csv|xlsx`

## 11. Thành viên, quản trị DigiAds, billing
- Thành viên (OWNER/ADMIN tổ chức hoặc quản trị DigiAds): `GET /orgs/:orgId/members` → `MembersDto`; `POST /orgs/:orgId/members/invitations` `{email, role: ADMIN|MEMBER, shopIds}`;
  `DELETE /orgs/:orgId/members/invitations/:id`; `PATCH /orgs/:orgId/members/:userId` `{role?, shopIds?}`; `DELETE /orgs/:orgId/members/:userId`.
- Quản trị (SUPER_ADMIN/ADMIN, Mod → 403): `GET|POST /admin/orgs`, `GET /admin/orgs/:id` → `AdminOrgDetailDto` (kèm AuditLog), `GET /admin/orgs/:id/connect-links`,
  `GET /admin/pool` → `PoolDto`, `POST /admin/orgs/:id/assign-seller {sellerAuthorizationId}`, `POST /admin/orgs/:id/assign-advertiser {advertiserId}`,
  `POST /admin/unassign {type: SELLER|ADVERTISER, id}`, `GET /admin/agency`, `POST /admin/agency/authorize-url`, `GET|POST /admin/staff`, `PATCH /admin/staff/:id {platformRole?, status?, shopIds?}`.
- Kết nối bổ sung: `POST /connections/orgs/:orgId/ads-mode {mode: TIKTOK|NONE}`, `POST /connections/orgs/:orgId/onboarded`; `GET /sync/watermark?orgId` → `SyncWatermarkDto`;
  `POST /sync/run {scopeType: ORG|SHOP|ADVERTISER, scopeId, resource?}`.
- Billing: `/billing/*?orgId` (sửa: quyền sửa tổ chức).
