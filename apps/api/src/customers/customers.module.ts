import { Controller, Get, Module, Query } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { CustomersSummaryDto, dateOnly } from "@ecomdash/shared";
import type { Access } from "../access/access";
import { Acc } from "../common/decorators";
import { div, getShopForUser, kpi, parsePeriod } from "../common/util";

@Controller("customers")
class CustomersController {
  @Get("summary")
  async summary(@Acc() access: Access, @Query() q: { shopId: string; from?: string; to?: string }): Promise<CustomersSummaryDto> {
    const shop = await getShopForUser(access, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const counts = async (from: string, to: string) => {
      const r = await prisma.$queryRaw<{ buyers: number; new_buyers: number; orders: number }[]>`
        WITH o AS (SELECT "buyerHash", "businessDate" FROM "Order" WHERE "shopId" = ${shop.id} AND "paidTime" IS NOT NULL AND status <> 'CANCELLED'),
             f AS (SELECT "buyerHash", MIN("businessDate") first FROM o GROUP BY 1)
        SELECT COUNT(DISTINCT o."buyerHash")::int buyers,
               COUNT(DISTINCT o."buyerHash") FILTER (WHERE f.first >= ${dateOnly(from)})::int new_buyers,
               COUNT(*)::int orders
        FROM o JOIN f USING ("buyerHash") WHERE o."businessDate" BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}`;
      return r[0] ?? { buyers: 0, new_buyers: 0, orders: 0 };
    };
    const [c, pr] = await Promise.all([counts(p.from, p.to), counts(p.prevFrom, p.prevTo)]);
    const segments = await prisma.$queryRaw<{ name: string; buyers: number; revenue: number }[]>`
      WITH b AS (
        SELECT "buyerHash", COUNT(*) n, SUM("originalProductPrice" - "sellerDiscount") rev FROM "Order"
        WHERE "shopId" = ${shop.id} AND "paidTime" IS NOT NULL AND status <> 'CANCELLED' AND "businessDate" <= ${dateOnly(p.to)} GROUP BY 1
        HAVING MAX("businessDate") >= ${dateOnly(p.from)})
      SELECT CASE WHEN n >= 4 THEN 'Trung thành (≥4 đơn)' WHEN n >= 2 THEN 'Quay lại (2–3 đơn)' ELSE 'Mới (1 đơn)' END name,
             COUNT(*)::int buyers, SUM(rev)::float revenue FROM b GROUP BY 1 ORDER BY 2 DESC`;
    const provinces = await prisma.$queryRaw<{ province: string; orders: number; revenue: number }[]>`
      SELECT COALESCE(province, 'Không rõ') province, COUNT(*)::int orders, SUM("originalProductPrice" - "sellerDiscount")::float revenue FROM "Order"
      WHERE "shopId" = ${shop.id} AND "paidTime" IS NOT NULL AND status <> 'CANCELLED' AND "businessDate" BETWEEN ${dateOnly(p.from)} AND ${dateOnly(p.to)}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 10`;
    const returning = (x: typeof c) => div(x.buyers - x.new_buyers, x.buyers);
    return {
      buyers: kpi(c.buyers, pr.buyers), newBuyers: kpi(c.new_buyers, pr.new_buyers), returningRate: kpi(returning(c), returning(pr)),
      ordersPerBuyer: div(c.orders, c.buyers), segments, topProvinces: provinces,
    };
  }
}

@Module({ controllers: [CustomersController] })
export class CustomersModule {}
