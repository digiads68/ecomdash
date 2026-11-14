import { Controller, Get, Module, Query } from "@nestjs/common";
import { prisma, Prisma } from "@ecomdash/database";
import { dateOnly, eachDate, Paged, ReturnRowDto, ReturnsSummaryDto, ymd } from "@ecomdash/shared";
import { OrgId } from "../common/decorators";
import { div, getShopForOrg, kpi, n, pageParams, parsePeriod } from "../common/util";

const OPEN = ["RETURN_OR_REFUND_REQUEST_PENDING", "AWAITING_BUYER_SHIP", "BUYER_SHIPPED_ITEM", "AWAITING_BUYER_RESPONSE"];

@Controller("returns")
class ReturnsController {
  @Get("summary")
  async summary(@OrgId() orgId: string, @Query() q: { shopId: string; from?: string; to?: string }): Promise<ReturnsSummaryDto> {
    const shop = await getShopForOrg(orgId, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const stat = (from: string, to: string) => prisma.shopDailyPnl.aggregate({
      where: { shopId: shop.id, date: { gte: dateOnly(from), lte: dateOnly(to) } },
      _sum: { ordersPaid: true, ordersReturned: true, ordersPartial: true, ordersCancelled: true, refundAmount: true },
    });
    const [cur, prev, reasons, open, daily] = await Promise.all([
      stat(p.from, p.to), stat(p.prevFrom, p.prevTo),
      prisma.returnRequest.groupBy({ by: ["reason"], where: { shopId: shop.id, kind: { in: ["REFUND", "RETURN_AND_REFUND"] }, businessDate: { gte: dateOnly(p.from), lte: dateOnly(p.to) } }, _count: true, orderBy: { _count: { reason: "desc" } }, take: 8 }),
      prisma.returnRequest.count({ where: { shopId: shop.id, status: { in: OPEN } } }),
      prisma.returnRequest.groupBy({ by: ["businessDate", "kind"], where: { shopId: shop.id, businessDate: { gte: dateOnly(p.from), lte: dateOnly(p.to) } }, _count: true }),
    ]);
    const rate = (a: typeof cur, k: "ret" | "can") => div(k === "ret" ? (a._sum.ordersReturned ?? 0) + (a._sum.ordersPartial ?? 0) : a._sum.ordersCancelled ?? 0, a._sum.ordersPaid ?? 0);
    return {
      returnRate: kpi(rate(cur, "ret"), rate(prev, "ret")),
      cancelRate: kpi(rate(cur, "can"), rate(prev, "can")),
      refundAmount: kpi(n(cur._sum.refundAmount), n(prev._sum.refundAmount)),
      openRequests: open,
      byReason: reasons.map((r) => ({ reason: r.reason ?? "Khác", count: r._count })),
      daily: eachDate(p.from, p.to).map((d) => ({
        date: d,
        returns: daily.filter((x) => ymd(x.businessDate) === d && (x.kind === "REFUND" || x.kind === "RETURN_AND_REFUND")).reduce((s, x) => s + x._count, 0),
        cancellations: daily.filter((x) => ymd(x.businessDate) === d && (x.kind === "CANCEL" || x.kind === "BUYER_CANCEL")).reduce((s, x) => s + x._count, 0),
      })),
    };
  }

  @Get()
  async list(@OrgId() orgId: string, @Query() q: { shopId: string; from?: string; to?: string; kind?: string; status?: string; page?: string; pageSize?: string }): Promise<Paged<ReturnRowDto>> {
    const shop = await getShopForOrg(orgId, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const { page, pageSize, skip, take } = pageParams(q.page, q.pageSize);
    const where: Prisma.ReturnRequestWhereInput = {
      shopId: shop.id, businessDate: { gte: dateOnly(p.from), lte: dateOnly(p.to) },
      ...(q.kind ? { kind: { in: q.kind.split(",") as any } } : {}), ...(q.status === "open" ? { status: { in: OPEN } } : q.status ? { status: q.status } : {}),
    };
    const [total, rows] = await Promise.all([prisma.returnRequest.count({ where }), prisma.returnRequest.findMany({ where, orderBy: { createTime: "desc" }, skip, take })]);
    return {
      total, page, pageSize,
      items: rows.map((r) => ({ id: r.id, tiktokReturnId: r.tiktokReturnId, tiktokOrderId: r.tiktokOrderId, kind: r.kind, status: r.status, reason: r.reason, refundTotal: n(r.refundTotal), returnedUnits: r.returnedUnits, createTime: r.createTime.toISOString() })),
    };
  }
}

@Module({ controllers: [ReturnsController] })
export class ReturnsModule {}
