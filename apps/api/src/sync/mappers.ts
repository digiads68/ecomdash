import type { Prisma } from "@ecomdash/database";
import type {
  OrderStatementTransaction, ReportRow, ShopCancellation, ShopOrder, ShopProductDetail, ShopProductSummary, ShopReturn, ShopStatement,
} from "@ecomdash/tiktok-client";
import { dateOnly, normalizeOrderStatus, toBusinessDate } from "@ecomdash/shared";
import { buyerHash } from "../common/crypto";

const money = (s?: string | number | null) => (s == null || s === "" ? 0 : Number(s));
const time = (sec?: number | null) => (sec ? new Date(sec * 1000) : null);

/** 03 §3 — order wire → Order row (PII reduced to a salted hash + province). */
export function mapOrder(o: ShopOrder, shopId: string, timeZone: string): Omit<Prisma.OrderUncheckedCreateInput, "id"> {
  const p = o.payment;
  const province = o.recipient_address?.district_info?.find((d) => d.address_level === "L1")?.address_name ?? null;
  return {
    shopId,
    tiktokOrderId: o.id,
    status: normalizeOrderStatus(o.status) as Prisma.OrderUncheckedCreateInput["status"],
    buyerHash: buyerHash(o.user_id),
    province,
    currency: p.currency,
    subTotal: money(p.sub_total),
    shippingFee: money(p.shipping_fee),
    sellerDiscount: money(p.seller_discount),
    platformDiscount: money(p.platform_discount),
    totalAmount: money(p.total_amount),
    originalProductPrice: money(p.original_total_product_price),
    isCod: !!o.is_cod,
    isSampleOrder: !!o.is_sample_order,
    paymentMethod: o.payment_method_name ?? null,
    shippingProvider: o.shipping_provider ?? null,
    shippingType: o.shipping_type ?? null,
    trackingNumber: o.tracking_number ?? null,
    cancelReason: o.cancel_reason ?? null,
    cancellationInitiator: o.cancellation_initiator ?? null,
    createTime: time(o.create_time)!,
    updateTime: time(o.update_time)!,
    paidTime: time(o.paid_time),
    rtsTime: time(o.rts_time),
    deliveryTime: time(o.delivery_time),
    cancelTime: time(o.cancel_time),
    businessDate: dateOnly(toBusinessDate(new Date(o.create_time * 1000), timeZone)),
    syncedAt: new Date(),
  };
}

export function mapLineItems(o: ShopOrder, orderId: string): Prisma.OrderLineItemCreateManyInput[] {
  return o.line_items.map((l) => ({
    orderId,
    tiktokLineItemId: l.id,
    tiktokProductId: l.product_id,
    tiktokSkuId: l.sku_id,
    productName: l.product_name,
    skuName: l.sku_name ?? null,
    sellerSku: l.seller_sku ?? null,
    skuImage: l.sku_image ?? null,
    originalPrice: money(l.original_price),
    salePrice: money(l.sale_price),
    sellerDiscount: money(l.seller_discount),
    platformDiscount: money(l.platform_discount),
    displayStatus: l.display_status ?? null,
    isGift: !!l.is_gift,
  }));
}

export function mapProduct(p: ShopProductSummary | ShopProductDetail, shopId: string) {
  const detail = p as ShopProductDetail;
  return {
    product: {
      shopId,
      tiktokProductId: p.id,
      title: p.title,
      status: p.status,
      thumbnailUrl: detail.main_images?.[0]?.urls?.[0] ?? null,
      categoryName: detail.category_chains?.find((c) => c.is_leaf)?.local_name ?? null,
      tiktokCreatedAt: time(p.create_time)!,
      tiktokUpdatedAt: time(p.update_time)!,
      syncedAt: new Date(),
    },
    skus: p.skus.map((s) => ({
      tiktokSkuId: s.id,
      sellerSku: s.seller_sku ?? null,
      name: s.sales_attributes?.map((a) => a.value_name).join(" / ") || null,
      salePrice: money(s.price.sale_price),
      listPrice: s.list_price ? money(s.list_price.amount) : null,
      inventory: s.inventory.reduce((x, i) => x + i.quantity, 0),
    })),
  };
}

export function mapReturn(r: ShopReturn, shopId: string, timeZone: string) {
  return {
    shopId,
    tiktokReturnId: r.return_id,
    tiktokOrderId: r.order_id,
    kind: r.return_type,
    status: r.return_status,
    reason: r.return_reason_text ?? r.return_reason ?? null,
    refundTotal: money(r.refund_amount?.refund_total),
    returnedUnits: r.return_line_items?.length ?? 0,
    createTime: time(r.create_time)!,
    updateTime: time(r.update_time)!,
    businessDate: dateOnly(toBusinessDate(new Date(r.create_time * 1000), timeZone)),
  } as const;
}

export function mapCancellation(c: ShopCancellation, shopId: string, timeZone: string) {
  return {
    shopId,
    tiktokReturnId: c.cancel_id,
    tiktokOrderId: c.order_id,
    kind: c.cancel_type,
    status: c.cancel_status,
    reason: c.cancel_reason_text ?? c.cancel_reason ?? null,
    refundTotal: money(c.refund_amount?.refund_total),
    returnedUnits: 0,
    createTime: time(c.create_time)!,
    updateTime: time(c.update_time)!,
    businessDate: dateOnly(toBusinessDate(new Date(c.create_time * 1000), timeZone)),
  } as const;
}

export function mapStatement(s: ShopStatement, shopId: string) {
  return {
    shopId,
    tiktokStatementId: s.id,
    statementTime: time(s.statement_time)!,
    currency: s.currency,
    revenueAmount: money(s.revenue_amount),
    feeAmount: money(s.fee_amount),
    adjustmentAmount: money(s.adjustment_amount),
    shippingCostAmount: money(s.shipping_cost_amount),
    settlementAmount: money(s.settlement_amount),
    paymentStatus: s.payment_status,
    paymentId: s.payment_id ?? null,
  };
}

const KNOWN_FEES: Record<string, "platformCommission" | "transactionFee" | "affiliateCommission" | "infrastructureFee"> = {
  platform_commission_amount: "platformCommission",
  referral_fee_amount: "platformCommission",
  transaction_fee_amount: "transactionFee",
  affiliate_commission_amount: "affiliateCommission",
  affiliate_ads_commission_amount: "affiliateCommission",
  vn_fix_infrastructure_fee_amount: "infrastructureFee",
};

/** 01 §8.2 — finance 202501 order transactions; fees are negative on the wire, stored as positive. Unknown fee keys → otherFees. */
export function mapSettlement(txs: OrderStatementTransaction[], orderId: string) {
  const out = {
    orderId, tiktokStatementId: null as string | null, currency: "VND",
    revenueAmount: 0, shippingCostAmount: 0, feeTaxAmount: 0, platformCommission: 0, transactionFee: 0,
    affiliateCommission: 0, infrastructureFee: 0, otherFees: 0, taxAmount: 0, settlementAmount: 0,
    raw: txs as unknown as Prisma.InputJsonValue, settledAt: null as Date | null, syncedAt: new Date(),
  };
  for (const t of txs) {
    out.tiktokStatementId = t.statement_id ?? out.tiktokStatementId;
    out.currency = t.currency;
    out.revenueAmount += money(t.revenue_amount);
    out.shippingCostAmount += money(t.shipping_cost_amount);
    out.feeTaxAmount += money(t.fee_tax_amount);
    out.settlementAmount += money(t.settlement_amount);
    if (t.statement_time) out.settledAt = new Date(t.statement_time * 1000);
    for (const sku of t.sku_transactions ?? []) {
      for (const [k, v] of Object.entries(sku.fee_tax_breakdown?.fee ?? {})) {
        const target = KNOWN_FEES[k];
        if (target) out[target] += Math.abs(money(v));
        else out.otherFees += Math.abs(money(v));
      }
      for (const v of Object.values(sku.fee_tax_breakdown?.tax ?? {})) out.taxAmount += Math.abs(money(v));
    }
  }
  return out;
}

export interface AdStatInput {
  campaignTiktokId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  orders: number;
  grossRevenue: number;
}

/** 02 §4 — report rows → normalized daily stats. */
export function mapIntegratedRow(r: ReportRow): AdStatInput {
  const m = r.metrics;
  return {
    campaignTiktokId: r.dimensions.campaign_id,
    date: r.dimensions.stat_time_day.slice(0, 10),
    spend: money(m.spend),
    impressions: Math.round(money(m.impressions)),
    clicks: Math.round(money(m.clicks)),
    conversions: Math.round(money(m.conversion)),
    orders: Math.round(money(m.complete_payment)),
    grossRevenue: money(m.total_complete_payment_rate),
  };
}

export function mapGmvMaxRow(r: ReportRow): AdStatInput {
  const m = r.metrics;
  return {
    campaignTiktokId: r.dimensions.campaign_id,
    date: r.dimensions.stat_time_day.slice(0, 10),
    spend: money(m.cost),
    impressions: 0,
    clicks: 0,
    conversions: Math.round(money(m.orders)),
    orders: Math.round(money(m.orders)),
    grossRevenue: money(m.gross_revenue),
  };
}
