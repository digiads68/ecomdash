import type { AdStatus, RoasMetrics, WaterfallStep } from "../pnl/summary";
import type { CostAppliesTo, CostMethod, OrderOutcome } from "../pnl/types";

export interface Kpi {
  value: number | null;
  previous: number | null;
  changePct: number | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ───── session / shops ─────
export type PlatformRole = "SUPER_ADMIN" | "ADMIN" | "MOD";
export type OrgRole = "OWNER" | "ADMIN" | "MEMBER";

/** Linking state of an organisation: both TikTok platforms must be connected before numbers are shown (12 §3.1). */
export interface OrgLinkStatus {
  shopLinked: boolean;
  shopCount: number;
  adsLinked: boolean;
  advertiserCount: number;
  adsMode: "TIKTOK" | "NONE";
  storeLinksComplete: boolean;
  ready: boolean;
  onboardedAt: string | null;
}

export interface MeDto {
  user: { id: string; name: string | null; email: string | null; hasPassword: boolean; tiktokLinked: boolean };
  platformRole: PlatformRole | null;
  organizations: { id: string; name: string; role: OrgRole | null; canEdit: boolean; status: OrgLinkStatus }[];
  demo: boolean;
}

export interface ShopDto {
  id: string;
  name: string;
  code: string | null;
  region: string;
  currency: string;
  timezone: string;
  organizationId: string;
  organizationName: string;
  canEdit: boolean;
}

export interface SyncWatermarkDto {
  organizationId: string;
  roundAt: string | null;
  shopSyncedTo: string | null;
  adsSyncedTo: string | null;
  adsLagMinutes: number | null;
  shopOk: boolean;
  adsOk: boolean;
  adsMode: "TIKTOK" | "NONE";
}

// ───── connections ─────
export type AuthStatus = "ACTIVE" | "NEEDS_REAUTH" | "REVOKED";

export interface ConnectionsDto {
  organizationId: string;
  canEdit: boolean;
  canRemove: boolean;
  status: OrgLinkStatus;
  sellerAuthorizations: {
    id: string;
    sellerName: string;
    source: "SELF_SIGNUP" | "APP_STORE" | "ADMIN_LINK";
    status: AuthStatus;
    accessExpiresAt: string;
    refreshExpiresAt: string;
    grantedScopes: string[];
    shops: { id: string; name: string; code: string | null; region: string; isActive: boolean; lastOrderSyncAt: string | null }[];
  }[];
  adsAuthorizations: {
    id: string;
    status: AuthStatus;
    kind: "CLIENT" | "AGENCY_BC";
    label: string | null;
    advertisers: {
      id: string;
      name: string;
      currency: string;
      timezone: string;
      timezoneMismatch: boolean;
      storeLinks: { id: string; storeId: string; storeName: string; shopId: string | null; shopName: string | null; matchedBy: string | null }[];
    }[];
  }[];
  plan: { name: "STARTER" | "PRO" | "ENTERPRISE"; maxShops: number | null; usedShops: number };
}

export interface SyncStateDto {
  id: string;
  scopeType: "SHOP" | "ADVERTISER";
  scopeId: string;
  scopeName: string;
  resource: string;
  status: "IDLE" | "RUNNING" | "OK" | "ERROR" | "BLOCKED";
  lastSuccessAt: string | null;
  lastError: string | null;
  lastWarning: string | null;
  itemsLastRun: number;
}

// ───── P&L ─────
export interface OutcomeBucket {
  count: number;
  amount: number;
  pctOfPaid: number | null;
}

export interface CostRowDto {
  key: string;
  label: string;
  group: "COGS" | "PLATFORM" | "PLATFORM_OTHER" | "CUSTOM" | "ADS";
  amount: number;
  pctOfRevenue: number | null;
  perSuccessOrder: number | null;
  estimated: boolean;
  note?: string;
}

export interface PnlSummaryDto {
  period: { from: string; to: string; settledShare: number | null };
  orders: Record<"paid" | "success" | "partialReturn" | "returned" | "cancelled" | "pending", OutcomeBucket>;
  waterfall: WaterfallStep[];
  costs: CostRowDto[];
  roas: RoasMetrics;
  unit: { successOrders: number; revenue: number | null; platformFees: number | null; otherFees: number | null; cogs: number | null; custom: number | null; contribution: number | null; adSpend: number | null; netProfit: number | null };
  ads: { spend: number; manualSpend: number; gmvMaxSpend: number; tiktokRevenue: number; tiktokOrders: number; spendPerPaidOrder: number | null; spendPerSuccessOrder: number | null };
  kpis: { realizedRevenue: Kpi; netProfit: Kpi; netMargin: Kpi; netProfitPerOrder: Kpi; adSpend: Kpi; roasReal: Kpi; roasTiktok: Kpi; breakEven: Kpi };
  dataQuality: {
    missingCostSkus: number; missingCostRevenueShare: number | null; unsettledOrders: number; feesEstimatedShare: number | null; cogsEstimatedShare: number | null;
    /** Shop-side ad data, for cross-checking only — never added to costs (12 §4). */
    shopGmvMaxAdFee: number; adsPaidFromBalance: number; gmvMaxFeeGap: number | null; gmvMaxRevenueShare: number | null;
  };
  syncedAt: string | null;
}

export interface PnlDailyRowDto {
  date: string;
  ordersPaid: number;
  ordersSuccess: number;
  ordersCancelled: number;
  ordersReturned: number;
  ordersPending: number;
  grossItemValue: number;
  realizedRevenue: number;
  contribution: number;
  adSpend: number;
  netProfit: number;
  roasTiktok: number | null;
  roasReal: number | null;
  breakEven: number | null;
}

export interface PnlProductRowDto {
  productId: string;
  title: string;
  thumbnailUrl: string | null;
  unitsSold: number;
  grossItemValue: number;
  cancelReturnRate: number | null;
  realizedRevenue: number;
  cogs: number;
  cogsEstimated: boolean;
  platformFees: number;
  customCosts: number;
  adSpendAllocated: number;
  netProfit: number;
  margin: number | null;
}

export interface PnlOrderRowDto {
  orderId: string;
  tiktokOrderId: string;
  createTime: string;
  outcome: OrderOutcome;
  itemNet: number;
  realizedRevenue: number;
  platformFees: number;
  otherPlatformFees: number;
  settlementAmount: number;
  cogs: number;
  customCosts: number;
  contribution: number;
  feesEstimated: boolean;
  cogsEstimated: boolean;
}

// ───── costs ─────
export interface CostSkuRowDto {
  skuId: string;
  tiktokSkuId: string;
  sellerSku: string | null;
  productId: string;
  productTitle: string;
  thumbnailUrl: string | null;
  skuName: string | null;
  salePrice: number;
  unitCost: number | null;
  effectiveFrom: string | null;
  unitsSold30d: number;
}

export interface CostSkuListDto extends Paged<CostSkuRowDto> {
  missingCount: number;
  totalSkus: number;
  missingRevenueShare: number | null;
}

export interface CostItemDto {
  id: string;
  shopId: string;
  name: string;
  method: CostMethod;
  amount: number;
  appliesTo: CostAppliesTo;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  amountInPeriod?: number;
}

export interface ShopConfigDto {
  defaultCogsPercent: number;
  restockReturns: boolean;
}

// ───── orders ─────
export type UiStatusGroup = "PENDING_PAYMENT" | "TO_SHIP" | "SHIPPING" | "DELIVERED" | "CANCELLED";

export interface OrderRowDto {
  id: string;
  tiktokOrderId: string;
  createTime: string;
  status: string;
  statusGroup: UiStatusGroup;
  outcome: OrderOutcome | null;
  totalAmount: number;
  itemCount: number;
  firstItem: { productName: string; skuName: string | null; skuImage: string | null };
  province: string | null;
  isCod: boolean;
  shippingProvider: string | null;
  settlementAmount: number | null;
}

export interface OrderListDto extends Paged<OrderRowDto> {
  statusCounts: Record<UiStatusGroup | "ALL", number>;
}

export interface OrderDetailDto {
  id: string;
  tiktokOrderId: string;
  status: string;
  statusGroup: UiStatusGroup;
  outcome: OrderOutcome | null;
  province: string | null;
  isCod: boolean;
  paymentMethod: string | null;
  shippingProvider: string | null;
  trackingNumber: string | null;
  cancelReason: string | null;
  payment: { subTotal: number; shippingFee: number; sellerDiscount: number; platformDiscount: number; totalAmount: number };
  lines: { tiktokSkuId: string; productName: string; skuName: string | null; sellerSku: string | null; skuImage: string | null; quantity: number; unitPrice: number; unitCost: number | null }[];
  settlement: { revenueAmount: number; platformCommission: number; transactionFee: number; affiliateCommission: number; infrastructureFee: number; shippingCostAmount: number; otherFees: number; taxAmount: number; settlementAmount: number; settledAt: string | null } | null;
  economics: PnlOrderRowDto | null;
  returns: ReturnRowDto[];
  timeline: { label: string; at: string }[];
}

// ───── products ─────
export interface ProductRowDto {
  id: string;
  tiktokProductId: string;
  title: string;
  thumbnailUrl: string | null;
  status: string;
  skuCount: number;
  inventory: number;
  minPrice: number;
  maxPrice: number;
  gmv: number;
  unitsSold: number;
  orders: number;
  pageViews: number | null;
  conversionRate: number | null;
  gmvChangePct: number | null;
}

// ───── ads ─────
export interface AdsOverviewDto {
  totals: { spend: Kpi; impressions: Kpi; clicks: Kpi; ctr: Kpi; cpc: Kpi; roasTiktok: Kpi; roasReal: Kpi; breakEven: Kpi; spendPerSuccessOrder: Kpi };
  manual: { spend: number; orders: number; grossRevenue: number; roasTiktok: number | null; roasReal: number | null };
  gmvMax: { spend: number; orders: number; grossRevenue: number; roasTiktok: number | null; roasReal: number | null };
  status: AdStatus;
  realizationRate: number | null;
  daily: { date: string; manualSpend: number; gmvMaxSpend: number; roasReal: number | null; breakEven: number | null }[];
  budgetForecast: { monthToDateSpend: number; projectedMonthSpend: number; daysElapsed: number; daysInMonth: number };
  allocation: "DIRECT" | "PROPORTIONAL" | "NONE";
}

export interface CampaignRowDto {
  id: string;
  tiktokCampaignId: string;
  name: string;
  kind: "MANUAL" | "GMV_MAX";
  advertiserName: string;
  operationStatus: string;
  budget: number | null;
  budgetMode: string | null;
  roasBid: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  orders: number;
  grossRevenue: number;
  roasTiktok: number | null;
  realRoasEstimated: number | null;
  vsBreakEven: AdStatus;
}

// ───── returns ─────
export interface ReturnRowDto {
  id: string;
  tiktokReturnId: string;
  tiktokOrderId: string;
  kind: string;
  status: string;
  reason: string | null;
  refundTotal: number;
  returnedUnits: number;
  createTime: string;
}

export interface ReturnsSummaryDto {
  returnRate: Kpi;
  cancelRate: Kpi;
  refundAmount: Kpi;
  openRequests: number;
  byReason: { reason: string; count: number }[];
  daily: { date: string; returns: number; cancellations: number }[];
}

// ───── finance ─────
export interface StatementRowDto {
  id: string;
  statementTime: string;
  revenueAmount: number;
  feeAmount: number;
  adjustmentAmount: number;
  shippingCostAmount: number;
  settlementAmount: number;
  paymentStatus: string;
}

// ───── customers ─────
export interface CustomersSummaryDto {
  buyers: Kpi;
  newBuyers: Kpi;
  returningRate: Kpi;
  ordersPerBuyer: number | null;
  segments: { name: string; buyers: number; revenue: number }[];
  topProvinces: { province: string; orders: number; revenue: number }[];
}

// ───── alerts / reports ─────
export type AlertMetric =
  | "gmv" | "orders" | "ad_spend" | "roas_tiktok" | "real_roas" | "real_roas_below_breakeven"
  | "net_profit" | "net_margin" | "cancel_rate" | "return_rate";

export interface AlertCondition {
  metric: AlertMetric;
  operator: "lt" | "lte" | "gt" | "gte";
  threshold: number;
  window: "today" | "24h" | "7d";
}

export interface AlertRuleDto {
  id: string;
  shopId: string | null;
  name: string;
  conditions: AlertCondition[];
  actions: ({ type: "email"; to: string } | { type: "telegram"; chatId: string })[];
  isActive: boolean;
  state: "FIRING" | "OK";
}

export interface AlertInstanceDto {
  id: string;
  ruleId: string | null;
  kind: string;
  title: string;
  state: "FIRING" | "RESOLVED";
  firedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
}

export interface ReportConfigDto {
  id: string;
  shopId: string;
  shopName: string;
  frequency: "daily" | "weekly" | "monthly";
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  recipientEmail: string;
  isActive: boolean;
  lastSentAt: string | null;
}

// ───── members ─────
export interface MemberDto {
  userId: string;
  name: string | null;
  email: string | null;
  role: OrgRole;
  shopIds: string[];
  lastLoginAt: string | null;
}

export interface InvitationDto {
  id: string;
  email: string;
  role: OrgRole | PlatformRole | null;
  shopIds: string[];
  expiresAt: string;
  inviteUrl?: string;
}

export interface MembersDto {
  organizationId: string;
  shops: { id: string; name: string }[];
  members: MemberDto[];
  invitations: InvitationDto[];
}

// ───── DigiAds admin ─────
export interface AdminOrgRowDto {
  id: string;
  name: string;
  owner: string | null;
  createdAt: string;
  status: OrgLinkStatus;
  shops: { id: string; name: string; code: string | null }[];
  authExpiresAt: string | null;
  lastRoundAt: string | null;
  realizedRevenue30d: number;
}

export interface PoolDto {
  sellerAuthorizations: { id: string; sellerName: string; source: string; createdAt: string; shops: { id: string; name: string; code: string | null }[] }[];
  advertisers: { id: string; tiktokAdvertiserId: string; name: string; currency: string; via: string[]; stores: { storeId: string; storeName: string; storeCode: string | null; matchedShopId: string | null; matchedOrgId: string | null }[] }[];
}

export interface AuditLogDto {
  id: string;
  action: string;
  actor: string | null;
  targetType: string;
  targetId: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AdminOrgDetailDto extends AdminOrgRowDto {
  advertisers: { id: string; name: string; tiktokAdvertiserId: string; via: string[] }[];
  members: MemberDto[];
  audit: AuditLogDto[];
}

export interface StaffDto {
  id: string;
  name: string | null;
  email: string | null;
  platformRole: PlatformRole;
  status: "ACTIVE" | "INVITED" | "DISABLED";
  shopIds: string[];
  lastLoginAt: string | null;
}
