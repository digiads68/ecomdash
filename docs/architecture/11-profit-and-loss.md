# 11 — Điều hành lãi lỗ (P&L)

> File này là **nguồn chuẩn** cho mọi con số lãi lỗ, ROAS và chi phí. Nếu `03`/`05`/`06` mâu thuẫn với file này, file này đúng.

## 1. Câu hỏi dashboard phải trả lời

Với **một shop** trong **một chu kỳ** (ngày, tuần, tháng, tuỳ chọn):
1. Bao nhiêu đơn đặt, bao nhiêu huỷ, bao nhiêu hoàn, bao nhiêu thành công, bao nhiêu còn đang chờ — số đơn và số tiền.
2. Đã chi bao nhiêu quảng cáo để có tập đơn đó.
3. TikTok báo ROAS bao nhiêu, ROAS thực bao nhiêu, cần bao nhiêu để hoà vốn.
4. Tiền đi đâu: giá vốn, phí sàn, phí khác trên sàn, chi phí tự nhập, quảng cáo — và cuối cùng lãi hay lỗ, bao nhiêu trên mỗi đơn.
5. Sản phẩm nào, chiến dịch nào đang làm lỗ.

## 2. Nguyên tắc gom kỳ: theo ngày đặt đơn (cohort)

- Một đơn thuộc kỳ chứa `Order.businessDate` (ngày `createTime` theo múi giờ shop), bất kể sau đó nó bị huỷ/hoàn lúc nào.
- Chi phí quảng cáo thuộc kỳ theo ngày chi (`AdDailyStat.date`). Đơn đặt ngày D đối chiếu với tiền QC chi ngày D → "chi phí quảng cáo cho đúng số đơn đó".
- Hệ quả: số liệu của kỳ gần đây **thay đổi dần** khi đơn chốt kết cục. Mọi màn hình hiển thị tỉ lệ "đã chốt" của kỳ (`settledShare`) và tách phần ước tính.

## 3. Đầu vào do người dùng nhập

### 3.1 Giá vốn theo SKU
```prisma
model SkuCost {
  id            String   @id @default(cuid())
  shopId        String
  skuId         String                          // Sku.id
  unitCost      Decimal  @db.Decimal(18, 2)     // giá vốn 1 đơn vị (VND)
  effectiveFrom DateTime @db.Date               // áp cho đơn có businessDate >= ngày này
  note          String?
  createdAt     DateTime @default(now())
  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
  sku  Sku  @relation(fields: [skuId], references: [id], onDelete: Cascade)

  @@unique([skuId, effectiveFrom])
  @@index([shopId])
}
```
- Giá vốn áp cho một đơn = bản ghi có `effectiveFrom` lớn nhất ≤ `businessDate` của đơn.
- SKU không có bản ghi nào hiệu lực → `unitCost = salePrice × ShopConfig.defaultCogsPercent / 100`, đánh dấu `cogsEstimated = true`.
- Nhập/xuất Excel: cột `tiktok_sku_id, seller_sku, product_title, sku_name, unit_cost, effective_from`. Dòng trùng `(sku, effective_from)` ghi đè. Dòng không khớp SKU → báo lỗi theo số dòng, không nhập dòng đó.

### 3.2 Chi phí tự nhập
```prisma
model CostItem {
  id            String        @id @default(cuid())
  shopId        String
  name          String                          // "Đóng gói", "Quà tặng kèm", "Lương CSKH"
  method        CostMethod                      // PER_ORDER | PERCENT_REVENUE | MONTHLY_FIXED
  amount        Decimal       @db.Decimal(18, 2) // VND/đơn | % (vd 2.50) | VND/tháng
  appliesTo     CostAppliesTo @default(SHIPPED) // chỉ dùng với PER_ORDER
  effectiveFrom DateTime      @db.Date
  effectiveTo   DateTime?     @db.Date
  isActive      Boolean       @default(true)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
}
enum CostMethod { PER_ORDER PERCENT_REVENUE MONTHLY_FIXED }
enum CostAppliesTo { PAID SHIPPED SUCCESS }
```
| method | Cách tính | Ví dụ |
|---|---|---|
| `PER_ORDER` | `amount` × số đơn thoả `appliesTo` | Đóng gói 3.000₫/đơn đã gửi; quà tặng 8.000₫/đơn thành công |
| `PERCENT_REVENUE` | `amount%` × doanh thu thực | Hoa hồng nhân viên livestream 2% |
| `MONTHLY_FIXED` | `amount ÷ số ngày của tháng` cho mỗi ngày trong `[effectiveFrom, effectiveTo]` | Lương CSKH 12.000.000₫/tháng, thuê kho 6.000.000₫/tháng |

`appliesTo`: `PAID` = mọi đơn đã thanh toán (kể cả huỷ) · `SHIPPED` = đơn đã giao cho vận chuyển (`rtsTime != null`, gồm thành công, hoàn, đang giao) · `SUCCESS` = đơn SUCCESS + PARTIAL_RETURN.

### 3.3 Cấu hình shop
`ShopConfig { shopId, defaultCogsPercent Decimal(5,2) @default(40), restockReturns Boolean @default(true) }`
`restockReturns = true`: hàng trả về nhập lại kho được → đơn RETURN_AND_REFUND không tính giá vốn. Đơn REFUND (hoàn tiền không trả hàng) luôn mất giá vốn.

## 4. Kết cục đơn

Chỉ xét đơn có `paidTime != null` và `isSampleOrder = false`. Mỗi đơn đúng một kết cục:

| `outcome` | Điều kiện (theo thứ tự ưu tiên) |
|---|---|
| `CANCELLED` | `status = CANCELLED` |
| `PENDING` | có ReturnRequest đang xử lý (status không thuộc nhóm kết thúc), **hoặc** status ∉ {DELIVERED, COMPLETED} |
| `RETURNED` | Σ `refundTotal` các ReturnRequest thành công ≥ 99% `itemNet` |
| `PARTIAL_RETURN` | có hoàn thành công nhưng < 99% |
| `SUCCESS` | còn lại (DELIVERED/COMPLETED, không hoàn) |

Return "thành công" = `RETURN_OR_REFUND_REQUEST_SUCCESS` hoặc `..._COMPLETE`. "Kết thúc không hoàn" = `REFUND_OR_RETURN_REQUEST_REJECT`, `..._CANCEL`, `REJECT_RECEIVE_PACKAGE`.
Đơn COMPLETED quá 30 ngày mà không có yêu cầu hoàn → chắc chắn SUCCESS.

## 5. Kinh tế một đơn (`OrderEconomics`)

```prisma
model OrderEconomics {
  orderId           String       @id
  shopId            String
  businessDate      DateTime     @db.Date
  outcome           OrderOutcome
  itemNet           Decimal @db.Decimal(18, 2)   // Σ line (originalPrice − sellerDiscount): giá trị hàng sau voucher shop
  buyerPaid         Decimal @db.Decimal(18, 2)   // payment.total_amount
  cancelledAmount   Decimal @db.Decimal(18, 2)   // = itemNet nếu CANCELLED
  refundAmount      Decimal @db.Decimal(18, 2)   // min(Σ refund thành công, itemNet)
  pendingAmount     Decimal @db.Decimal(18, 2)   // = itemNet nếu PENDING
  realizedRevenue   Decimal @db.Decimal(18, 2)   // itemNet − refund (SUCCESS/PARTIAL/RETURNED), 0 với CANCELLED/PENDING
  platformFees      Decimal @db.Decimal(18, 2)   // hoa hồng + giao dịch + affiliate + hạ tầng
  otherPlatformFees Decimal @db.Decimal(18, 2)   // phần còn lại để khớp đối soát (ship người bán chịu, ship hoàn, điều chỉnh, thuế)
  settlementAmount  Decimal @db.Decimal(18, 2)   // thực nhận
  feesEstimated     Boolean
  units             Int                          // số đơn vị (kể cả quà tặng)
  costedUnits       Int                          // đơn vị phải tính giá vốn
  cogs              Decimal @db.Decimal(18, 2)
  cogsEstimated     Boolean
  customCosts       Decimal @db.Decimal(18, 2)   // PER_ORDER + PERCENT_REVENUE (MONTHLY_FIXED tính ở ngày)
  contribution      Decimal @db.Decimal(18, 2)   // settlement − cogs − customCosts (chưa trừ QC)
  computedAt        DateTime @default(now())
  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@index([shopId, businessDate])
  @@index([shopId, outcome])
}
enum OrderOutcome { SUCCESS PARTIAL_RETURN RETURNED CANCELLED PENDING }
```

Quy tắc tính:
- **Phí khi đã đối soát** (`OrderSettlement` tồn tại): `platformFees = |platformCommission + transactionFee + affiliateCommission + infrastructureFee|`; `settlementAmount = OrderSettlement.settlementAmount`; `otherPlatformFees = realizedRevenue − platformFees − settlementAmount` (phần dư để thác luôn khớp số TikTok trả). `feesEstimated = false`.
- **Chưa đối soát** (SUCCESS/PARTIAL/RETURNED): dùng tỉ lệ bình quân 30 ngày của shop `r_fee = Σ platformFees / Σ realizedRevenue` và `r_other` tương tự trên các đơn đã đối soát; chưa có đơn nào đối soát → mặc định `r_fee = 9%`, `r_other = 1.5%` (`PNL_DEFAULT_FEE_RATE`, `PNL_DEFAULT_OTHER_RATE`). Đơn RETURNED chưa đối soát: `otherPlatformFees` = phí ship hoàn ước tính 22.000₫ (`PNL_DEFAULT_RETURN_SHIPPING`). `feesEstimated = true`.
- **CANCELLED**: mọi khoản phí = 0, thực nhận = 0.
- **Giá vốn**: `costedUnits` = SUCCESS: `units`; PARTIAL_RETURN: `units − returnedUnits` nếu `restockReturns` và kind RETURN_AND_REFUND, ngược lại `units`; RETURNED: 0 nếu `restockReturns` và kind RETURN_AND_REFUND, ngược lại `units`; CANCELLED/PENDING: 0. `cogs = Σ costedUnits_line × unitCost(sku, businessDate)`.
  `ReturnRequest` cần thêm cột `returnedUnits Int` (= số phần tử `return_line_items`).
- **Chi phí tự nhập theo đơn**: Σ PER_ORDER khớp `appliesTo` (hiệu lực tại `businessDate`) + Σ PERCENT_REVENUE × `realizedRevenue`.
- **PENDING**: tất cả cột tiền thực = 0, chỉ `pendingAmount` có giá trị. Phần ước tính tính ở cấp ngày (§6).

## 6. Lãi lỗ theo ngày (`ShopDailyPnl`)

```prisma
model ShopDailyPnl {
  id                 String   @id @default(cuid())
  shopId             String
  date               DateTime @db.Date
  ordersPaid         Int
  ordersSuccess      Int
  ordersPartial      Int
  ordersReturned     Int
  ordersCancelled    Int
  ordersPending      Int
  grossItemValue     Decimal @db.Decimal(18, 2)  // Σ itemNet đơn đã thanh toán = "GMV đặt hàng"
  buyerPaid          Decimal @db.Decimal(18, 2)
  cancelledAmount    Decimal @db.Decimal(18, 2)
  refundAmount       Decimal @db.Decimal(18, 2)
  pendingAmount      Decimal @db.Decimal(18, 2)
  pendingExpected    Decimal @db.Decimal(18, 2)  // pendingAmount × tỉ lệ thành công lịch sử
  realizedRevenue    Decimal @db.Decimal(18, 2)  // đã chốt + pendingExpected
  platformFees       Decimal @db.Decimal(18, 2)
  otherPlatformFees  Decimal @db.Decimal(18, 2)
  settlementAmount   Decimal @db.Decimal(18, 2)
  cogs               Decimal @db.Decimal(18, 2)
  customCostsOrder   Decimal @db.Decimal(18, 2)
  customCostsFixed   Decimal @db.Decimal(18, 2)  // MONTHLY_FIXED phân bổ cho ngày
  contribution       Decimal @db.Decimal(18, 2)  // lãi gộp trước QC
  adSpend            Decimal @db.Decimal(18, 2)
  adSpendManual      Decimal @db.Decimal(18, 2)
  adSpendGmvMax      Decimal @db.Decimal(18, 2)
  tiktokAdRevenue    Decimal @db.Decimal(18, 2)  // Σ grossRevenue TikTok báo (đã phân bổ cho shop)
  tiktokAdOrders     Int
  netProfit          Decimal @db.Decimal(18, 2)
  estimatedShare     Decimal @db.Decimal(5, 4)   // phần realizedRevenue đến từ ước tính (0–1)
  computedAt         DateTime @default(now())
  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
  @@unique([shopId, date])
}
```

Ước tính cho đơn PENDING (cấp ngày):
- `s = tỉ lệ thành công lịch sử` = Σ realizedRevenue ÷ Σ (grossItemValue − pendingAmount) của các ngày **đã chốt hết** trong 60 ngày trước (`PNL_HISTORY_DAYS`); không đủ dữ liệu → `0.85`.
- `pendingExpected = pendingAmount × s`; phí, giá vốn, chi phí theo đơn của phần này = `pendingExpected × (tỉ lệ tương ứng trên đơn đã chốt cùng 30 ngày)`; giá vốn ước tính dùng tỉ lệ `cogs ÷ realizedRevenue` của đơn đã chốt, nếu chưa có thì `defaultCogsPercent`.
- Phần dự kiến mất `pendingAmount − pendingExpected` hiện trong thác dưới tên "Dự kiến huỷ/hoàn (đơn đang chờ)".

**Phân bổ quảng cáo cho shop**: với mỗi `AdDailyStat` ngày D của advertiser A: tập shop gắn với A qua `AdvertiserStoreLink.shopId` (GMV_MAX dùng đúng `storeId` của dòng). Một shop → nhận 100%. Nhiều shop → chia theo `grossItemValue` ngày D của các shop đó (bằng nhau nếu tất cả = 0). Áp cùng tỉ lệ cho `spend`, `grossRevenue`, `orders`.

`contribution = settlementAmount + settlementExpected − cogs − customCostsOrder − customCostsFixed`
`netProfit = contribution − adSpend`

## 7. Thác lãi lỗ (thứ tự trình bày)

| # | Bậc | Giá trị | Ghi chú |
|---|---|---|---|
| 1 | GMV đặt hàng | Σ grossItemValue | cơ sở so với ROAS TikTok |
| 2 | − Huỷ | Σ cancelledAmount | |
| 3 | − Hoàn | Σ refundAmount | |
| 4 | − Dự kiến huỷ/hoàn (đang chờ) | Σ (pendingAmount − pendingExpected) | ẩn nếu = 0 |
| 5 | **= Doanh thu thực** | Σ realizedRevenue | 1 − 2 − 3 − 4 |
| 6 | − Phí sàn | Σ platformFees | gồm ước tính |
| 7 | − Phí khác trên sàn | Σ otherPlatformFees | |
| 8 | **= Thực nhận** | 5 − 6 − 7 | khớp tiền TikTok trả với phần đã đối soát |
| 9 | − Giá vốn | Σ cogs | |
| 10 | − Chi phí tự nhập | Σ customCostsOrder + customCostsFixed | tách từng dòng CostItem trong bảng chi tiết |
| 11 | **= Lãi gộp trước quảng cáo** | 8 − 9 − 10 | |
| 12 | − Chi phí quảng cáo | Σ adSpend | tách Thủ công / GMV Max |
| 13 | **= Lãi ròng** | 11 − 12 | |

Mỗi bậc trả về: `amount`, `pctOfRevenue` (÷ bậc 5), `perSuccessOrder` (÷ (ordersSuccess + ordersPartial + kỳ vọng từ pending)), `estimatedAmount` (phần ước tính).
**Bất biến kiểm thử:** bậc 5 = 1−2−3−4; bậc 8 = 5−6−7; bậc 13 = 11−12 — sai lệch ≤ 1₫ do làm tròn.

## 8. Chỉ số ROAS và hiệu quả

TikTok chỉ biết đơn nào do quảng cáo mang lại; Shop API thì không. Vì vậy ROAS thực lấy doanh thu TikTok quy cho quảng cáo rồi **trừ phần huỷ/hoàn theo tỉ lệ thực tế của shop cùng kỳ**:

| Chỉ số | Công thức | null khi |
|---|---|---|
| ROAS TikTok | Σ tiktokAdRevenue ÷ Σ adSpend | adSpend = 0 |
| Tỉ lệ thành doanh thu | Doanh thu thực ÷ GMV đặt hàng (cùng kỳ, cùng shop) | GMV = 0 |
| **ROAS thực** | ROAS TikTok × Tỉ lệ thành doanh thu | |
| **ROAS thực nhận** | ROAS thực × (Thực nhận ÷ Doanh thu thực) | |
| **ROAS hoà vốn** | Doanh thu thực ÷ Lãi gộp trước QC (= 1 ÷ biên đóng góp) | Lãi gộp ≤ 0 → "Không hoà vốn được" |
| Chênh ROAS | 1 − ROAS thực ÷ ROAS TikTok (= tỉ lệ huỷ+hoàn theo tiền) | |
| ROAS toàn shop (phụ) | Doanh thu thực ÷ Σ adSpend — gồm cả đơn tự nhiên, dùng để xem tổng thể, không so với hoà vốn | adSpend = 0 |
| Chi QC / đơn thành công | adSpend ÷ đơn thành công (gồm kỳ vọng) | |
| Chi QC / đơn đặt | adSpend ÷ ordersPaid | |
| Lãi ròng / đơn thành công | netProfit ÷ đơn thành công | |
| Biên lãi ròng | netProfit ÷ Doanh thu thực | |
| Tỉ lệ huỷ / hoàn (theo đơn và theo tiền) | ordersCancelled ÷ ordersPaid; cancelledAmount ÷ grossItemValue … | |

Ý nghĩa hoà vốn: mỗi 1₫ doanh thu thực để lại `biên đóng góp` sau giá vốn, phí sàn, chi phí tự nhập; quảng cáo có lãi khi doanh thu thực nó mang lại × biên ≥ tiền QC, tức ROAS thực ≥ ROAS hoà vốn.

Trạng thái quảng cáo: `ROAS thực ≥ ROAS hoà vốn × 1.2` → "Có lãi" (xanh); `≥ hoà vốn` → "Sát hoà vốn" (vàng); `< hoà vốn` → "Đang lỗ" (đỏ).

**Theo chiến dịch**: cùng công thức ở cấp chiến dịch: `realRoas = ROAS TikTok của chiến dịch × Tỉ lệ thành doanh thu của shop cùng kỳ`. GMV Max: không trừ phần organic (TikTok không tách), chỉ ghi chú. Đây là ước tính vì tỉ lệ huỷ/hoàn của đơn quảng cáo có thể khác đơn tự nhiên.

## 9. Lãi lỗ theo sản phẩm

`ProductDailyStat` bổ sung: `grossItemValue`, `cancelledAmount`, `refundAmount`, `realizedRevenue`, `platformFees`, `otherPlatformFees`, `cogs`, `customCosts`, `adSpendAllocated`, `contribution`, `netProfit`, `returnedUnits`.
Phân bổ trong một đơn: mỗi khoản cấp đơn (phí, phí khác, chi phí theo đơn, refund) chia cho line item theo tỉ lệ `itemNet` của line; giá vốn tính đúng theo SKU. Chi QC và MONTHLY_FIXED cấp ngày chia cho sản phẩm theo tỉ lệ `realizedRevenue` trong ngày (nhãn "phân bổ").

## 10. Tính lại (`pnl.recompute`)

Payload `{ shopId, fromDate, toDate? }`. Các bước trong 1 transaction cho mỗi ngày:
1. Xoá và tính lại `OrderEconomics` cho đơn có `businessDate` trong khoảng.
2. Tính `ShopDailyPnl` + `ProductDailyStat` (cột P&L).

Kích hoạt:
| Sự kiện | fromDate |
|---|---|
| Sync đơn / hoàn / đối soát chạm vào đơn | min(businessDate các đơn bị chạm) |
| Sync báo cáo QC | ngày nhỏ nhất của dữ liệu QC vừa ghi |
| Sửa/nhập giá vốn | min(effectiveFrom vừa ghi) |
| Sửa CostItem / ShopConfig | effectiveFrom (hoặc toàn bộ 400 ngày nếu đổi % mặc định) |
| Lịch | mỗi 30 phút cho 45 ngày gần nhất (`PNL_OPEN_WINDOW_DAYS`) — để đơn PENDING chuyển kết cục |

Hàm tính thuần đặt trong `packages/shared/src/pnl/` (`classifyOutcome`, `computeOrderEconomics`, `computeDailyPnl`, `buildWaterfall`, `roasMetrics`) — không phụ thuộc Prisma — để unit test và để web dùng lại cho phần "giả lập" (vd kéo thanh giá vốn).

## 11. API

| Method | Path | Trả về |
|---|---|---|
| GET | `/pnl/summary?shopId&from&to` | `PnlSummaryDto` |
| GET | `/pnl/daily?shopId&from&to` | `{date, ordersPaid, ordersSuccess, ordersCancelled, ordersReturned, ordersPending, grossItemValue, realizedRevenue, adSpend, netProfit, roasTiktok, roasReal}[]` |
| GET | `/pnl/products?shopId&from&to&sort=netProfit:asc` | `{productId, title, thumbnailUrl, unitsSold, grossItemValue, realizedRevenue, returnRate, cogs, platformFees, customCosts, adSpendAllocated, netProfit, margin, cogsEstimated}[]` |
| GET | `/pnl/orders?shopId&from&to&outcome&page&pageSize` | dòng `OrderEconomics` + mã đơn |
| GET | `/costs/skus?shopId&missing=true&q&page` | `{skuId, tiktokSkuId, sellerSku, productTitle, skuName, salePrice, unitCost:number|null, effectiveFrom, isDefault, unitsSold30d}[]` + `{missingCount, totalSkus}` |
| PUT | `/costs/skus` | `{shopId, items:[{skuId, unitCost, effectiveFrom}]}` → enqueue recompute |
| POST | `/costs/skus/import?shopId` | multipart xlsx/csv → `{imported, errors:[{row, message}]}` |
| GET | `/costs/skus/export?shopId&format=xlsx|csv` | file |
| GET/POST | `/costs/items?shopId` | `CostItem[]` / tạo |
| PUT/DELETE | `/costs/items/:id` | sửa / xoá |
| GET/PUT | `/shops/:id/config` | `{defaultCogsPercent, restockReturns}` |

```ts
interface PnlSummaryDto {
  period: { from: string; to: string; settledShare: number };       // phần đơn đã chốt kết cục (theo tiền)
  orders: Record<'paid'|'success'|'partialReturn'|'returned'|'cancelled'|'pending',
                 { count: number; amount: number; pctOfPaid: number }>;
  waterfall: { key: string; label: string; amount: number; pctOfRevenue: number|null;
               perSuccessOrder: number|null; estimatedAmount: number; kind: 'start'|'minus'|'subtotal' }[];
  costs: { key: string; label: string; group: 'COGS'|'PLATFORM'|'PLATFORM_OTHER'|'CUSTOM'|'ADS';
           amount: number; pctOfRevenue: number; perSuccessOrder: number; estimated: boolean }[];
  roas: { tiktok: number|null; realizationRate: number|null; real: number|null; realSettlement: number|null;
          breakEven: number|null; gapPct: number|null; shopWide: number|null;
          status: 'PROFIT'|'NEAR_BREAKEVEN'|'LOSS'|'NO_SPEND' };
  unit: { revenuePerOrder; feesPerOrder; cogsPerOrder; customPerOrder; adSpendPerOrder; netProfitPerOrder };
  ads: { spend; manualSpend; gmvMaxSpend; tiktokRevenue; tiktokOrders; adSpendPerPaidOrder };
  netProfit: number; netMargin: number|null;
  previous: { realizedRevenue; netProfit; adSpend; roasReal: number|null; ordersSuccess };   // kỳ liền trước cùng độ dài
  dataQuality: { missingCostSkus: number; unsettledOrders: number; feesEstimatedShare: number; cogsEstimatedShare: number };
}
```

## 12. Giao diện (thay `06-frontend.md` §3.1 và bổ sung)

**Điều hành lãi lỗ** (`/overview`, trang chủ):
1. Thanh kỳ: Tháng này · Tháng trước · 7 ngày · 30 ngày · Tuỳ chọn; dòng phụ "Đã chốt 78% đơn của kỳ — phần còn lại là ước tính".
2. Dải kết cục đơn: Đặt → Huỷ → Hoàn → Thành công → Đang chờ (số đơn, tiền, % trên đơn đặt).
3. Bốn ô ROAS cạnh nhau: ROAS TikTok (ghi "tính cả đơn huỷ/hoàn") → ROAS thực ("sau huỷ/hoàn x%") → ROAS thực nhận ("sau phí sàn") · ROAS hoà vốn; badge trạng thái quảng cáo; dòng phụ ROAS toàn shop.
4. Biểu đồ thác lãi lỗ (§7), cột ước tính vẽ sọc.
5. Bảng chi phí theo nhóm (Giá vốn · Phí sàn từng loại · Phí khác · Chi phí tự nhập từng dòng · Quảng cáo thủ công/GMV Max): tiền, % doanh thu thực, / đơn thành công, nhãn "ước tính".
6. "Một đơn thành công": doanh thu → phí → giá vốn → chi phí → QC → lãi (số trên mỗi đơn).
7. Biểu đồ theo ngày: cột doanh thu thực + đường lãi ròng + đường ROAS thực vs hoà vốn.
8. Cảnh báo chất lượng dữ liệu: "12 SKU chưa nhập giá vốn (chiếm 18% doanh thu) → Nhập ngay".

**Lãi lỗ sản phẩm** (`/profit/products`): bảng sắp xếp theo lãi ròng tăng dần (lỗ lên đầu), dòng lỗ nền đỏ nhạt; cột ước tính có dấu "≈".

**Quảng cáo**: bảng chiến dịch có cột ROAS TikTok · ROAS thực (≈) · trạng thái so với hoà vốn.

**Cài đặt → Chi phí** (`/settings/costs`):
- Ô % giá vốn mặc định, công tắc "Hàng hoàn nhập lại kho".
- Lưới giá vốn SKU: tìm, lọc "Chưa nhập", sửa trực tiếp ô `Giá vốn`, chọn `Áp dụng từ`; thanh "x/y SKU đã nhập · chiếm z% doanh thu"; nút Xuất Excel mẫu / Nhập Excel.
- Danh sách chi phí tự nhập: tên, cách tính, số tiền, áp cho, hiệu lực, bật/tắt; form thêm dòng.
- Sau khi lưu: toast "Đã lưu. Đang tính lại lãi lỗ từ 01/11…".
