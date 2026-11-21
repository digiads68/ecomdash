import { Controller, Get, Module, Query } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { dateOnly, StatementRowDto } from "@ecomdash/shared";
import type { Access } from "../access/access";
import { Acc } from "../common/decorators";
import { getShopForUser, n, pageParams, parsePeriod } from "../common/util";
import { econRow } from "../pnl/pnl.service";

@Controller("finance")
class FinanceController {
  @Get("statements")
  async statements(@Acc() access: Access, @Query() q: { shopId: string; from?: string; to?: string }): Promise<StatementRowDto[]> {
    const shop = await getShopForUser(access, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const rows = await prisma.statement.findMany({ where: { shopId: shop.id, statementTime: { gte: dateOnly(p.from), lte: new Date(dateOnly(p.to).getTime() + 8 * 86_400_000) } }, orderBy: { statementTime: "desc" } });
    return rows.map((s) => ({
      id: s.id, statementTime: s.statementTime.toISOString(), revenueAmount: n(s.revenueAmount), feeAmount: n(s.feeAmount), adjustmentAmount: n(s.adjustmentAmount),
      shippingCostAmount: n(s.shippingCostAmount), settlementAmount: n(s.settlementAmount), paymentStatus: s.paymentStatus,
    }));
  }

  /** Per-order settlement view: actual TikTok numbers when settled, estimate otherwise. */
  @Get("settlements")
  async settlements(@Acc() access: Access, @Query() q: { shopId: string; from?: string; to?: string; settled?: string; page?: string; pageSize?: string }) {
    const shop = await getShopForUser(access, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const { page, pageSize, skip, take } = pageParams(q.page, q.pageSize);
    const where = {
      shopId: shop.id, businessDate: { gte: dateOnly(p.from), lte: dateOnly(p.to) }, outcome: { in: ["SUCCESS", "PARTIAL_RETURN", "RETURNED"] as any },
      ...(q.settled === "true" ? { feesEstimated: false } : q.settled === "false" ? { feesEstimated: true } : {}),
    };
    const [total, rows, agg] = await Promise.all([
      prisma.orderEconomics.count({ where }),
      prisma.orderEconomics.findMany({ where, include: { order: { select: { tiktokOrderId: true, createTime: true } } }, orderBy: { businessDate: "desc" }, skip, take }),
      prisma.orderEconomics.groupBy({ by: ["feesEstimated"], where, _sum: { settlementAmount: true, platformFees: true, otherPlatformFees: true, realizedRevenue: true }, _count: true }),
    ]);
    const settled = agg.find((a) => !a.feesEstimated), est = agg.find((a) => a.feesEstimated);
    return {
      total, page, pageSize, items: rows.map((r) => econRow(r, r.order)),
      totals: {
        settledOrders: settled?._count ?? 0, settledAmount: n(settled?._sum.settlementAmount),
        unsettledOrders: est?._count ?? 0, estimatedAmount: n(est?._sum.settlementAmount),
        platformFees: n(settled?._sum.platformFees) + n(est?._sum.platformFees), otherFees: n(settled?._sum.otherPlatformFees) + n(est?._sum.otherPlatformFees),
        realizedRevenue: n(settled?._sum.realizedRevenue) + n(est?._sum.realizedRevenue),
      },
    };
  }
}

@Module({ controllers: [FinanceController] })
export class FinanceModule {}
