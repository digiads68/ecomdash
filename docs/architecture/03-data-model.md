# 03 — Mô hình dữ liệu (PostgreSQL / Prisma)

Schema dưới đây là **nguồn sự thật** cho `packages/database/prisma/schema.prisma`. Migration mới thay thế hoàn toàn hai migration cũ (dự án chưa có dữ liệu production → được phép reset: xoá `prisma/migrations/*`, tạo `20261115000000_v2_init`).

## 1. Sơ đồ quan hệ

```
Organization ─┬─< OrganizationMember >── User
              ├─< SellerAuthorization ─< Shop ─┬─< Product ─< Sku
              │                                ├─< Order ─< OrderLineItem
              │                                │      └── OrderSettlement (1–1, tuỳ chọn)
              │                                ├─< Statement
              │                                ├─< ReturnRequest
              │                                ├─< ShopDailyStat
              │                                ├─< ProductDailyStat
              │                                └── ShopConfig
              ├─< AdsAuthorization ─< Advertiser ─┬─< Campaign ─< AdDailyStat
              │                                   └─< AdvertiserStoreLink >── Shop (tuỳ chọn)
              ├─< AlertRule ─< AlertInstance
              ├─< ReportConfig
              ├─< SyncState
              └── Subscription
WebhookEvent (toàn cục, khử trùng)
```

## 2. Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ───────────────────────── Tổ chức & người dùng ─────────────────────────

model Organization {
  id         String    @id @default(cuid())
  clerkOrgId String?   @unique            // org_id trong JWT Clerk; null với org demo
  name       String
  slug       String    @unique
  plan       Plan      @default(STARTER)
  status     OrgStatus @default(ACTIVE)
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  members              OrganizationMember[]
  sellerAuthorizations SellerAuthorization[]
  shops                Shop[]
  adsAuthorizations    AdsAuthorization[]
  advertisers          Advertiser[]
  alertRules           AlertRule[]
  reportConfigs        ReportConfig[]
  syncStates           SyncState[]
  subscription         Subscription?
}

model User {
  id          String   @id @default(cuid())
  clerkUserId String?  @unique
  email       String   @unique
  name        String?
  avatarUrl   String?
  createdAt   DateTime @default(now())

  memberships OrganizationMember[]
}

model OrganizationMember {
  id             String       @id @default(cuid())
  organizationId String
  userId         String?
  inviteEmail    String?
  role           MemberRole
  status         MemberStatus @default(ACTIVE)
  permissions    Json         @default("{}")
  createdAt      DateTime     @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User?        @relation(fields: [userId], references: [id])

  @@unique([organizationId, userId])
}

// ───────────────────────── Kết nối TikTok Shop ─────────────────────────

model SellerAuthorization {
  id                    String     @id @default(cuid())
  organizationId        String
  openId                String                         // token/get → open_id
  sellerName            String
  sellerBaseRegion      String                         // "VN"
  accessTokenEncrypted  String
  refreshTokenEncrypted String
  accessExpiresAt       DateTime                       // từ access_token_expire_in (timestamp tuyệt đối)
  refreshExpiresAt      DateTime
  grantedScopes         String[]
  status                AuthStatus @default(ACTIVE)
  lastRefreshedAt       DateTime?
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  shops        Shop[]

  @@unique([organizationId, openId])
}

model Shop {
  id                    String     @id @default(cuid())
  organizationId        String
  sellerAuthorizationId String
  tiktokShopId          String                         // authorization/shops → id
  cipher                String                         // → cipher (shop_cipher)
  code                  String?                        // → code
  name                  String
  region                String     @default("VN")
  sellerType            String     @default("LOCAL")   // LOCAL | CROSS_BORDER
  currency              String     @default("VND")
  timezone              String     @default("Asia/Ho_Chi_Minh")
  isActive              Boolean    @default(true)       // false = người dùng tắt đồng bộ
  createdAt             DateTime   @default(now())
  updatedAt             DateTime   @updatedAt

  organization        Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  sellerAuthorization SellerAuthorization   @relation(fields: [sellerAuthorizationId], references: [id], onDelete: Cascade)
  config              ShopConfig?
  products            Product[]
  orders              Order[]
  statements          Statement[]
  returns             ReturnRequest[]
  dailyStats          ShopDailyStat[]
  productDailyStats   ProductDailyStat[]
  storeLinks          AdvertiserStoreLink[]
  alertRules          AlertRule[]
  reportConfigs       ReportConfig[]

  @@unique([organizationId, tiktokShopId])
  @@index([organizationId])
}

model ShopConfig {
  id                  String  @id @default(cuid())
  shopId              String  @unique
  cogsPercent         Decimal @default(40) @db.Decimal(5, 2)   // giá vốn % trên doanh thu hàng
  packagingCostPerOrder Decimal @default(0) @db.Decimal(18, 2) // chi phí đóng gói / đơn
  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)
}

// ───────────────────────── Thương mại ─────────────────────────

model Product {
  id              String   @id @default(cuid())
  shopId          String
  tiktokProductId String
  title           String
  status          String                              // DRAFT|PENDING|FAILED|ACTIVATE|SELLER_DEACTIVATED|PLATFORM_DEACTIVATED|FREEZE|DELETED
  thumbnailUrl    String?
  categoryName    String?                             // phần tử lá của category_chains
  tiktokCreatedAt DateTime
  tiktokUpdatedAt DateTime
  syncedAt        DateTime @default(now())

  shop  Shop  @relation(fields: [shopId], references: [id], onDelete: Cascade)
  skus  Sku[]
  dailyStats ProductDailyStat[]

  @@unique([shopId, tiktokProductId])
}

model Sku {
  id          String   @id @default(cuid())
  productId   String
  tiktokSkuId String
  sellerSku   String?
  name        String?                                 // ghép sales_attributes: "Đỏ / M"
  salePrice   Decimal  @db.Decimal(18, 2)
  listPrice   Decimal? @db.Decimal(18, 2)
  inventory   Int      @default(0)                    // tổng inventory[].quantity
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, tiktokSkuId])
}

model Order {
  id                    String      @id @default(cuid())
  shopId                String
  tiktokOrderId         String
  status                OrderStatus
  buyerHash             String                                // sha256(user_id + PII_SALT)
  province              String?                               // district_info cấp 1
  currency              String      @default("VND")
  subTotal              Decimal     @db.Decimal(18, 2)
  shippingFee           Decimal     @db.Decimal(18, 2)
  sellerDiscount        Decimal     @db.Decimal(18, 2)
  platformDiscount      Decimal     @db.Decimal(18, 2)
  totalAmount           Decimal     @db.Decimal(18, 2)        // = GMV của đơn
  originalProductPrice  Decimal     @db.Decimal(18, 2)
  isCod                 Boolean     @default(false)
  isSampleOrder         Boolean     @default(false)
  paymentMethod         String?
  shippingProvider      String?
  shippingType          String?
  trackingNumber        String?
  cancelReason          String?
  cancellationInitiator String?
  createTime            DateTime
  updateTime            DateTime
  paidTime              DateTime?
  rtsTime               DateTime?
  deliveryTime          DateTime?
  cancelTime            DateTime?
  businessDate          DateTime    @db.Date                  // ngày createTime theo Shop.timezone
  syncedAt              DateTime    @default(now())

  shop       Shop             @relation(fields: [shopId], references: [id], onDelete: Cascade)
  lineItems  OrderLineItem[]
  settlement OrderSettlement?
  returns    ReturnRequest[]

  @@unique([shopId, tiktokOrderId])
  @@index([shopId, businessDate])
  @@index([shopId, status])
  @@index([shopId, buyerHash])
}

model OrderLineItem {
  id               String   @id @default(cuid())
  orderId          String
  tiktokLineItemId String
  tiktokProductId  String
  tiktokSkuId      String
  productName      String
  skuName          String?
  sellerSku        String?
  skuImage         String?
  originalPrice    Decimal  @db.Decimal(18, 2)
  salePrice        Decimal  @db.Decimal(18, 2)
  sellerDiscount   Decimal  @db.Decimal(18, 2)
  platformDiscount Decimal  @db.Decimal(18, 2)
  displayStatus    String?
  isGift           Boolean  @default(false)
  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@unique([orderId, tiktokLineItemId])
  @@index([tiktokProductId])
}

// ───────────────────────── Tài chính ─────────────────────────

model Statement {
  id                String   @id @default(cuid())
  shopId            String
  tiktokStatementId String
  statementTime     DateTime
  currency          String
  revenueAmount     Decimal  @db.Decimal(18, 2)
  feeAmount         Decimal  @db.Decimal(18, 2)
  adjustmentAmount  Decimal  @db.Decimal(18, 2)
  shippingCostAmount Decimal @db.Decimal(18, 2)
  settlementAmount  Decimal  @db.Decimal(18, 2)
  paymentStatus     String                              // PAID | PROCESSING | FAILED
  paymentId         String?
  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@unique([shopId, tiktokStatementId])
  @@index([shopId, statementTime])
}

model OrderSettlement {
  id                     String   @id @default(cuid())
  orderId                String   @unique
  tiktokStatementId      String?
  currency               String
  revenueAmount          Decimal  @db.Decimal(18, 2)
  shippingCostAmount     Decimal  @db.Decimal(18, 2)   // âm = seller chịu
  feeTaxAmount           Decimal  @db.Decimal(18, 2)   // âm
  platformCommission     Decimal  @db.Decimal(18, 2) @default(0)
  transactionFee         Decimal  @db.Decimal(18, 2) @default(0)
  affiliateCommission    Decimal  @db.Decimal(18, 2) @default(0)
  infrastructureFee      Decimal  @db.Decimal(18, 2) @default(0)  // vn_fix_infrastructure_fee
  otherFees              Decimal  @db.Decimal(18, 2) @default(0)
  taxAmount              Decimal  @db.Decimal(18, 2) @default(0)
  settlementAmount       Decimal  @db.Decimal(18, 2)   // thực nhận
  raw                    Json                            // giữ nguyên response để tính lại
  settledAt              DateTime?
  syncedAt               DateTime @default(now())
  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
}

// ───────────────────────── Hoàn / huỷ ─────────────────────────

model ReturnRequest {
  id             String     @id @default(cuid())
  shopId         String
  orderId        String?                               // Order.id nếu đơn đã đồng bộ
  tiktokReturnId String
  tiktokOrderId  String
  kind           ReturnKind                            // REFUND | RETURN_AND_REFUND | REPLACEMENT | CANCEL | BUYER_CANCEL
  status         String                                // return_status / cancel_status gốc
  reason         String?
  refundTotal    Decimal    @db.Decimal(18, 2) @default(0)
  createTime     DateTime
  updateTime     DateTime
  businessDate   DateTime   @db.Date
  shop  Shop   @relation(fields: [shopId], references: [id], onDelete: Cascade)
  order Order? @relation(fields: [orderId], references: [id])

  @@unique([shopId, tiktokReturnId])
  @@index([shopId, businessDate])
}

// ───────────────────────── Quảng cáo ─────────────────────────

model AdsAuthorization {
  id                   String     @id @default(cuid())
  organizationId       String
  accessTokenEncrypted String
  scopes               String[]
  status               AuthStatus @default(ACTIVE)
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  advertisers  Advertiser[]
}

model Advertiser {
  id                  String   @id @default(cuid())
  organizationId      String
  adsAuthorizationId  String
  tiktokAdvertiserId  String
  name                String
  currency            String   @default("VND")
  timezone            String   @default("Asia/Ho_Chi_Minh")
  ownerBcId           String?
  isActive            Boolean  @default(true)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  organization     Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  adsAuthorization AdsAuthorization      @relation(fields: [adsAuthorizationId], references: [id], onDelete: Cascade)
  campaigns        Campaign[]
  storeLinks       AdvertiserStoreLink[]
  dailyStats       AdDailyStat[]

  @@unique([organizationId, tiktokAdvertiserId])
}

model AdvertiserStoreLink {
  id                  String   @id @default(cuid())
  advertiserId        String
  storeId             String                          // gmv_max/store/list → store_id
  storeCode           String?
  storeName           String
  storeAuthorizedBcId String?
  shopId              String?                         // null = chưa khớp được (xem 02 §3.4)
  matchedBy           String?                         // STORE_ID | STORE_CODE | MANUAL
  isGmvMaxAvailable   Boolean  @default(false)
  advertiser Advertiser @relation(fields: [advertiserId], references: [id], onDelete: Cascade)
  shop       Shop?      @relation(fields: [shopId], references: [id])

  @@unique([advertiserId, storeId])
}

model Campaign {
  id               String       @id @default(cuid())
  advertiserId     String
  tiktokCampaignId String
  name             String
  kind             CampaignKind                        // MANUAL | GMV_MAX
  objectiveType    String?
  operationStatus  String                              // ENABLE | DISABLE
  budgetMode       String?
  budget           Decimal?     @db.Decimal(18, 2)
  roasBid          Decimal?     @db.Decimal(10, 2)     // GMV Max
  storeId          String?                             // GMV Max
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt
  advertiser Advertiser    @relation(fields: [advertiserId], references: [id], onDelete: Cascade)
  dailyStats AdDailyStat[]

  @@unique([advertiserId, tiktokCampaignId])
}

model AdDailyStat {
  id           String       @id @default(cuid())
  advertiserId String
  campaignId   String
  date         DateTime     @db.Date                   // stat_time_day (múi giờ advertiser)
  source       AdStatSource                            // INTEGRATED | GMV_MAX
  storeId      String?                                 // GMV_MAX: store_ids[0]
  spend        Decimal      @db.Decimal(18, 2)
  impressions  Int          @default(0)
  clicks       Int          @default(0)
  conversions  Int          @default(0)
  orders       Int          @default(0)
  grossRevenue Decimal      @db.Decimal(18, 2) @default(0)
  syncedAt     DateTime     @default(now())
  advertiser Advertiser @relation(fields: [advertiserId], references: [id], onDelete: Cascade)
  campaign   Campaign   @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@unique([campaignId, date, source])
  @@index([advertiserId, date])
}

// ───────────────────────── Tổng hợp theo ngày ─────────────────────────

model ShopDailyStat {
  id                String   @id @default(cuid())
  shopId            String
  date              DateTime @db.Date
  gmv               Decimal  @db.Decimal(18, 2)   // Σ totalAmount, loại UNPAID/CANCELLED/sample
  orders            Int                            // số đơn hợp lệ
  unitsSold         Int                            // Σ line item không phải quà tặng
  buyers            Int                            // distinct buyerHash
  newBuyers         Int                            // buyerHash chưa từng mua trước ngày này
  cancelledOrders   Int
  cancelledAmount   Decimal  @db.Decimal(18, 2)
  returnRequests    Int
  refundAmount      Decimal  @db.Decimal(18, 2)
  codOrders         Int
  sellerDiscount    Decimal  @db.Decimal(18, 2)
  pageViews         Int?                           // analytics API
  visitors          Int?                           // analytics API
  analyticsGmv      Decimal? @db.Decimal(18, 2)    // để đối chiếu
  computedAt        DateTime @default(now())
  shop Shop @relation(fields: [shopId], references: [id], onDelete: Cascade)

  @@unique([shopId, date])
}

model ProductDailyStat {
  id              String   @id @default(cuid())
  shopId          String
  productId       String
  date            DateTime @db.Date
  gmv             Decimal  @db.Decimal(18, 2)     // Σ salePrice line item thuộc đơn hợp lệ
  orders          Int                              // số đơn chứa sản phẩm
  unitsSold       Int
  pageViews       Int?
  impressions     Int?
  shop    Shop    @relation(fields: [shopId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@unique([productId, date])
  @@index([shopId, date])
}

// ───────────────────────── Vận hành ─────────────────────────

model SyncState {
  id             String     @id @default(cuid())
  organizationId String
  scopeType      String                             // SHOP | ADVERTISER
  scopeId        String                             // Shop.id | Advertiser.id
  resource       String                             // orders | products | returns | finance | analytics | ads_entities | ads_reports
  cursor         DateTime?                          // update_time đã đồng bộ tới
  status         SyncRunStatus @default(IDLE)
  lastStartedAt  DateTime?
  lastSuccessAt  DateTime?
  lastError      String?
  lastWarning    String?
  itemsLastRun   Int        @default(0)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([scopeType, scopeId, resource])
}

model WebhookEvent {
  id                 String   @id @default(cuid())
  ttsNotificationId  String   @unique
  type               Int
  tiktokShopId       String?
  payload            Json
  receivedAt         DateTime @default(now())
  processedAt        DateTime?
}

// ───────────────────────── Cảnh báo, báo cáo, thanh toán ─────────────────────────

model AlertRule {
  id             String   @id @default(cuid())
  organizationId String
  shopId         String?
  name           String
  conditions     Json                               // xem 04 §7
  actions        Json
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  shop         Shop?           @relation(fields: [shopId], references: [id])
  instances    AlertInstance[]
}

model AlertInstance {
  id             String     @id @default(cuid())
  ruleId         String?                            // null = cảnh báo hệ thống (token sắp hết hạn, sync lỗi)
  organizationId String
  shopId         String?
  kind           String     @default("RULE")        // RULE | AUTH_EXPIRING | SYNC_FAILED
  title          String
  state          AlertState
  metadata       Json       @default("{}")
  firedAt        DateTime   @default(now())
  resolvedAt     DateTime?
  acknowledgedAt DateTime?
  rule AlertRule? @relation(fields: [ruleId], references: [id], onDelete: Cascade)

  @@index([organizationId, state])
}

model ReportConfig {
  id             String    @id @default(cuid())
  organizationId String
  shopId         String
  frequency      String                             // daily | weekly | monthly
  dayOfWeek      Int?                               // 1=Thứ 2 … 7=Chủ nhật (ISO)
  dayOfMonth     Int?
  recipientEmail String
  isActive       Boolean   @default(true)
  lastSentAt     DateTime?
  createdAt      DateTime  @default(now())
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  shop         Shop         @relation(fields: [shopId], references: [id], onDelete: Cascade)
}

model Subscription {
  id                   String             @id @default(cuid())
  organizationId       String             @unique
  plan                 Plan
  status               SubscriptionStatus
  stripeSubscriptionId String?
  stripeCustomerId     String?
  currentPeriodEnd     DateTime?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
}

// ───────────────────────── Enum ─────────────────────────

enum Plan { STARTER PRO ENTERPRISE }
enum OrgStatus { ACTIVE SUSPENDED }
enum MemberRole { OWNER ADMIN MEMBER VIEWER }
enum MemberStatus { ACTIVE INVITED SUSPENDED }
enum AuthStatus { ACTIVE NEEDS_REAUTH REVOKED }
enum SyncRunStatus { IDLE RUNNING OK ERROR BLOCKED }
enum OrderStatus {
  UNPAID ON_HOLD AWAITING_SHIPMENT PARTIALLY_SHIPPING AWAITING_COLLECTION
  IN_TRANSIT DELIVERED COMPLETED CANCELLED
}
enum ReturnKind { REFUND RETURN_AND_REFUND REPLACEMENT CANCEL BUYER_CANCEL }
enum CampaignKind { MANUAL GMV_MAX }
enum AdStatSource { INTEGRATED GMV_MAX }
enum AlertState { FIRING RESOLVED }
enum SubscriptionStatus { ACTIVE PAST_DUE CANCELED TRIALING }
```

(Trong file `.prisma` thật, enum viết mỗi giá trị một dòng.)

## 3. Ánh xạ API → cột (những chỗ không hiển nhiên)

| Cột | Nguồn | Ghi chú |
|---|---|---|
| `SellerAuthorization.accessExpiresAt` | `access_token_expire_in` | `new Date(sec * 1000)` — đã là timestamp tuyệt đối |
| `Shop.cipher` | `authorization/shops[].cipher` | bắt buộc cho mọi API theo shop |
| `Order.buyerHash` | `user_id` | `sha256(user_id + PII_SALT)` hex 32 ký tự đầu |
| `Order.province` | `recipient_address.district_info[]` | phần tử có `address_level = "L1"` (hoặc phần tử đầu sau quốc gia) |
| `Order.businessDate` | `create_time` | `toZonedDate(createTime, shop.timezone)` |
| `Order.totalAmount` | `payment.total_amount` | chuỗi → Decimal |
| `OrderLineItem` | `line_items[]` | mỗi phần tử một dòng (1 đơn vị) |
| `Product.thumbnailUrl` | `main_images[0].urls[0]` | |
| `Sku.inventory` | `Σ skus[].inventory[].quantity` | |
| `ReturnRequest.kind` | `return_type` / `cancel_type` | cancellations ghi kind `CANCEL`/`BUYER_CANCEL` |
| `ReturnRequest.refundTotal` | `refund_amount.refund_total` | |
| `AdDailyStat.grossRevenue` (INTEGRATED) | `total_complete_payment_rate` | xem 02 §4.1 |
| `AdDailyStat.*` (GMV_MAX) | `cost`, `orders`, `gross_revenue` | |

## 4. Định nghĩa chỉ số (mọi tầng dùng chung, đặt trong `packages/shared/src/metrics.ts`)

| Chỉ số | Công thức |
|---|---|
| Đơn hợp lệ | `status ∉ {UNPAID, CANCELLED}` và `isSampleOrder = false` |
| GMV | Σ `Order.totalAmount` đơn hợp lệ |
| AOV | GMV ÷ số đơn hợp lệ |
| Tỉ lệ huỷ | đơn CANCELLED ÷ tổng đơn đã thanh toán (`paidTime != null`) |
| Tỉ lệ hoàn | ReturnRequest kind ∈ {REFUND, RETURN_AND_REFUND} ÷ đơn hợp lệ cùng kỳ |
| Chi QC | Σ `AdDailyStat.spend` (cả 2 nguồn) của advertiser có link tới shop |
| ROAS tổng | GMV ÷ Chi QC |
| ROAS thủ công | Σ grossRevenue ÷ Σ spend, `source = INTEGRATED` |
| ROI GMV Max | Σ grossRevenue ÷ Σ spend, `source = GMV_MAX` (gồm organic) |
| TACoS | Chi QC ÷ GMV |
| Thực nhận | Σ `OrderSettlement.settlementAmount` |
| Lợi nhuận ước tính | Thực nhận − giá vốn (`cogsPercent × doanh thu hàng`) − đóng gói × số đơn − Chi QC |
| Khách mới | buyerHash xuất hiện lần đầu trong kỳ (so với toàn bộ lịch sử) |

Khi chi QC dùng chung cho nhiều shop (một advertiser link nhiều shop): chia theo tỉ lệ GMV của từng shop trong ngày. Ghi rõ "phân bổ" trên UI.
