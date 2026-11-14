import { Controller, Get, Module, Query } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { dateOnly, ProductRowDto } from "@ecomdash/shared";
import { OrgId } from "../common/decorators";
import { div, getShopForOrg, n, parsePeriod } from "../common/util";

@Controller("products")
class ProductsController {
  @Get()
  async list(@OrgId() orgId: string, @Query() q: { shopId: string; from?: string; to?: string; sort?: string; status?: string; q?: string }): Promise<ProductRowDto[]> {
    const shop = await getShopForOrg(orgId, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const agg = (from: string, to: string) => prisma.productDailyStat.groupBy({
      by: ["productId"], where: { shopId: shop.id, date: { gte: dateOnly(from), lte: dateOnly(to) } }, _sum: { gmv: true, unitsSold: true, orders: true, pageViews: true },
    });
    const [cur, prev, products] = await Promise.all([
      agg(p.from, p.to), agg(p.prevFrom, p.prevTo),
      prisma.product.findMany({
        where: { shopId: shop.id, ...(q.status ? { status: q.status } : {}), ...(q.q ? { title: { contains: q.q, mode: "insensitive" } } : {}) },
        include: { skus: true },
      }),
    ]);
    const c = new Map(cur.map((x) => [x.productId, x._sum]));
    const pv = new Map(prev.map((x) => [x.productId, x._sum]));
    const rows: ProductRowDto[] = products.map((pr) => {
      const s = c.get(pr.id);
      const prices = pr.skus.map((k) => n(k.salePrice));
      const gmv = n(s?.gmv);
      const prevGmv = n(pv.get(pr.id)?.gmv);
      return {
        id: pr.id, tiktokProductId: pr.tiktokProductId, title: pr.title, thumbnailUrl: pr.thumbnailUrl, status: pr.status, skuCount: pr.skus.length,
        inventory: pr.skus.reduce((x, k) => x + k.inventory, 0), minPrice: Math.min(...prices, Infinity) === Infinity ? 0 : Math.min(...prices), maxPrice: prices.length ? Math.max(...prices) : 0,
        gmv, unitsSold: s?.unitsSold ?? 0, orders: s?.orders ?? 0, pageViews: s?.pageViews ?? null,
        conversionRate: div(s?.orders ?? 0, s?.pageViews ?? 0), gmvChangePct: prevGmv > 0 ? (gmv - prevGmv) / prevGmv : null,
      };
    });
    const [field, dir] = (q.sort ?? "gmv:desc").split(":") as [keyof ProductRowDto, string];
    rows.sort((a, b) => ((Number(a[field]) || 0) - (Number(b[field]) || 0)) * (dir === "asc" ? 1 : -1));
    return rows;
  }
}

@Module({ controllers: [ProductsController] })
export class ProductsModule {}
