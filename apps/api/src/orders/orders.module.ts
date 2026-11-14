import { Controller, Get, Module, NotFoundException, Param, Query } from "@nestjs/common";
import { prisma, Prisma } from "@ecomdash/database";
import { dateOnly, OrderDetailDto, OrderListDto, ORDER_STATUS_GROUP, STATUSES_BY_GROUP, UiStatusGroup, ymd } from "@ecomdash/shared";
import { OrgId } from "../common/decorators";
import { getShopForOrg, n, pageParams, parsePeriod } from "../common/util";
import { econRow } from "../pnl/pnl.service";

const GROUPS: UiStatusGroup[] = ["PENDING_PAYMENT", "TO_SHIP", "SHIPPING", "DELIVERED", "CANCELLED"];

@Controller("orders")
class OrdersController {
  @Get()
  async list(@OrgId() orgId: string, @Query() q: { shopId: string; from?: string; to?: string; status?: string; q?: string; cod?: string; page?: string; pageSize?: string }): Promise<OrderListDto> {
    const shop = await getShopForOrg(orgId, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const base: Prisma.OrderWhereInput = {
      shopId: shop.id, businessDate: { gte: dateOnly(p.from), lte: dateOnly(p.to) },
      ...(q.q ? { OR: [{ tiktokOrderId: { startsWith: q.q.trim() } }, { trackingNumber: { startsWith: q.q.trim() } }] } : {}),
      ...(q.cod === "true" ? { isCod: true } : q.cod === "false" ? { isCod: false } : {}),
    };
    const statusFilter = q.status ? (STATUSES_BY_GROUP[q.status as UiStatusGroup] ?? [q.status]) : null;
    const where = { ...base, ...(statusFilter ? { status: { in: statusFilter as any } } : {}) };
    const { page, pageSize, skip, take } = pageParams(q.page, q.pageSize);
    const [total, rows, counts] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({ where, orderBy: { createTime: "desc" }, skip, take, include: { lineItems: { take: 1 }, settlement: true, economics: true, _count: { select: { lineItems: true } } } }),
      prisma.order.groupBy({ by: ["status"], where: base, _count: true }),
    ]);
    const statusCounts = Object.fromEntries([["ALL", 0], ...GROUPS.map((g) => [g, 0])]) as OrderListDto["statusCounts"];
    for (const c of counts) { statusCounts[ORDER_STATUS_GROUP[c.status]] += c._count; statusCounts.ALL += c._count; }
    return {
      total, page, pageSize, statusCounts,
      items: rows.map((o) => ({
        id: o.id, tiktokOrderId: o.tiktokOrderId, createTime: o.createTime.toISOString(), status: o.status, statusGroup: ORDER_STATUS_GROUP[o.status],
        outcome: o.economics?.outcome ?? null, totalAmount: n(o.totalAmount), itemCount: o._count.lineItems,
        firstItem: { productName: o.lineItems[0]?.productName ?? "", skuName: o.lineItems[0]?.skuName ?? null, skuImage: o.lineItems[0]?.skuImage ?? null },
        province: o.province, isCod: o.isCod, shippingProvider: o.shippingProvider, settlementAmount: o.settlement ? n(o.settlement.settlementAmount) : null,
      })),
    };
  }

  @Get(":id")
  async detail(@OrgId() orgId: string, @Param("id") id: string): Promise<OrderDetailDto> {
    const o = await prisma.order.findFirst({ where: { id, shop: { organizationId: orgId } }, include: { lineItems: true, settlement: true, economics: true, returns: true, shop: true } });
    if (!o) throw new NotFoundException();
    const skus = await prisma.sku.findMany({ where: { tiktokSkuId: { in: o.lineItems.map((l) => l.tiktokSkuId) }, product: { shopId: o.shopId } }, include: { costs: { where: { effectiveFrom: { lte: o.businessDate } }, orderBy: { effectiveFrom: "desc" }, take: 1 } } });
    const costOf = new Map(skus.map((s) => [s.tiktokSkuId, s.costs[0] ? n(s.costs[0].unitCost) : null]));
    const grouped = new Map<string, OrderDetailDto["lines"][number]>();
    for (const l of o.lineItems) {
      const g = grouped.get(l.tiktokSkuId);
      if (g) g.quantity++;
      else grouped.set(l.tiktokSkuId, { tiktokSkuId: l.tiktokSkuId, productName: l.productName, skuName: l.skuName, sellerSku: l.sellerSku, skuImage: l.skuImage, quantity: 1, unitPrice: n(l.originalPrice) - n(l.sellerDiscount), unitCost: costOf.get(l.tiktokSkuId) ?? null });
    }
    const s = o.settlement;
    const timeline = ([["Đặt hàng", o.createTime], ["Thanh toán", o.paidTime], ["Sẵn sàng giao", o.rtsTime], ["Giao thành công", o.deliveryTime], ["Huỷ", o.cancelTime], ["Đối soát", s?.settledAt]] as [string, Date | null | undefined][])
      .filter(([, t]) => t).map(([label, t]) => ({ label, at: t!.toISOString() }));
    for (const r of o.returns) timeline.push({ label: `Yêu cầu ${r.kind === "REFUND" ? "hoàn tiền" : r.kind === "RETURN_AND_REFUND" ? "trả hàng hoàn tiền" : r.kind === "REPLACEMENT" ? "đổi hàng" : "huỷ"}`, at: r.createTime.toISOString() });
    timeline.sort((a, b) => a.at.localeCompare(b.at));
    return {
      id: o.id, tiktokOrderId: o.tiktokOrderId, status: o.status, statusGroup: ORDER_STATUS_GROUP[o.status], outcome: o.economics?.outcome ?? null,
      province: o.province, isCod: o.isCod, paymentMethod: o.paymentMethod, shippingProvider: o.shippingProvider, trackingNumber: o.trackingNumber, cancelReason: o.cancelReason,
      payment: { subTotal: n(o.subTotal), shippingFee: n(o.shippingFee), sellerDiscount: n(o.sellerDiscount), platformDiscount: n(o.platformDiscount), totalAmount: n(o.totalAmount) },
      lines: [...grouped.values()],
      settlement: s ? {
        revenueAmount: n(s.revenueAmount), platformCommission: n(s.platformCommission), transactionFee: n(s.transactionFee), affiliateCommission: n(s.affiliateCommission),
        infrastructureFee: n(s.infrastructureFee), shippingCostAmount: n(s.shippingCostAmount), otherFees: n(s.otherFees), taxAmount: n(s.taxAmount),
        settlementAmount: n(s.settlementAmount), settledAt: s.settledAt?.toISOString() ?? null,
      } : null,
      economics: o.economics ? econRow(o.economics, o) : null,
      returns: o.returns.map((r) => ({ id: r.id, tiktokReturnId: r.tiktokReturnId, tiktokOrderId: r.tiktokOrderId, kind: r.kind, status: r.status, reason: r.reason, refundTotal: n(r.refundTotal), returnedUnits: r.returnedUnits, createTime: r.createTime.toISOString() })),
      timeline,
    };
  }
}

@Module({ controllers: [OrdersController] })
export class OrdersModule {}
