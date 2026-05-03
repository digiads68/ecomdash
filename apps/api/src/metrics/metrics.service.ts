import { Injectable } from "@nestjs/common";
import { ClickHouseService } from "./clickhouse.service";
import { MetricOverview, RevenueTrendPoint, TopProduct, CampaignMetric } from "@ecomdash/shared";
import { prisma } from "@ecomdash/database";

@Injectable()
export class MetricsService {
  constructor(private readonly ch: ClickHouseService) {}

  async getOverview(orgId: string, shopId: string, from: Date, to: Date): Promise<MetricOverview> {
    const periodMs = to.getTime() - from.getTime();
    const priorFrom = new Date(from.getTime() - periodMs);
    const priorTo = from;

    const [current, prior] = await Promise.all([
      this.fetchPeriodMetrics(orgId, shopId, from, to),
      this.fetchPeriodMetrics(orgId, shopId, priorFrom, priorTo),
    ]);

    const pctChange = (curr: number, prev: number) =>
      prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100 * 10) / 10;

    const roas = current.adSpend > 0 ? Math.round((current.revenue / current.adSpend) * 100) / 100 : 0;
    const priorRoas = prior.adSpend > 0 ? Math.round((prior.revenue / prior.adSpend) * 100) / 100 : 0;

    return {
      revenue: current.revenue,
      revenueChange: pctChange(current.revenue, prior.revenue),
      orders: current.orders,
      ordersChange: pctChange(current.orders, prior.orders),
      adSpend: current.adSpend,
      adSpendChange: pctChange(current.adSpend, prior.adSpend),
      roas,
      roasChange: pctChange(roas, priorRoas),
    };
  }

  private async fetchPeriodMetrics(orgId: string, shopId: string, from: Date, to: Date) {
    const rows = await this.ch.query<{ metric_name: string; value_sum: number }>(
      `SELECT metric_name, sum(value_sum) AS value_sum
       FROM ecomdash.metrics_daily_mv
       WHERE tenant_id = {orgId:String}
         AND shop_id = {shopId:String}
         AND date >= toDate({from:String})
         AND date <= toDate({to:String})
       GROUP BY metric_name`,
      {
        orgId,
        shopId,
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
      }
    );

    const get = (name: string) => rows.find((r) => r.metric_name === name)?.value_sum ?? 0;
    return {
      revenue: get("gmv"),
      orders: get("order_count"),
      adSpend: get("ad_spend"),
    };
  }

  async getRevenueTrend(
    orgId: string,
    shopId: string,
    from: Date,
    to: Date,
    granularity: "hour" | "day"
  ): Promise<RevenueTrendPoint[]> {
    const dateExpr = granularity === "hour"
      ? "toStartOfHour(timestamp)"
      : "toDate(timestamp)";

    const rows = await this.ch.query<{ date: string; revenue: number; orders: number }>(
      `SELECT
         ${dateExpr} AS date,
         sumIf(value, metric_name = 'gmv') AS revenue,
         sumIf(value, metric_name = 'order_count') AS orders
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         AND shop_id = {shopId:String}
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
         AND metric_name IN ('gmv', 'order_count')
       GROUP BY date
       ORDER BY date ASC`,
      {
        orgId,
        shopId,
        from: from.toISOString(),
        to: to.toISOString(),
      }
    );

    return rows.map((r) => ({
      date: r.date,
      revenue: r.revenue,
      orders: r.orders,
    }));
  }

  async getTopProducts(
    orgId: string,
    shopId: string,
    from: Date,
    to: Date,
    limit = 10
  ): Promise<TopProduct[]> {
    const rows = await this.ch.query<{
      product_id: string;
      revenue: number;
      orders: number;
      ad_spend: number;
    }>(
      `SELECT
         dimensions['product_id'] AS product_id,
         sumIf(value, metric_name = 'gmv') AS revenue,
         sumIf(value, metric_name = 'order_count') AS orders,
         sumIf(value, metric_name = 'ad_spend') AS ad_spend
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         AND shop_id = {shopId:String}
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
         AND notEmpty(dimensions['product_id'])
       GROUP BY product_id
       ORDER BY revenue DESC
       LIMIT {limit:UInt32}`,
      { orgId, shopId, from: from.toISOString(), to: to.toISOString(), limit }
    );

    // Enrich with Postgres product names
    const productIds = rows.map((r) => r.product_id);
    const products = await prisma.product.findMany({
      where: { tiktokProductId: { in: productIds } },
      select: { tiktokProductId: true, name: true, thumbnailUrl: true },
    });
    const productMap = new Map(products.map((p) => [p.tiktokProductId, p]));

    return rows.map((r) => {
      const p = productMap.get(r.product_id);
      return {
        productId: r.product_id,
        name: p?.name ?? r.product_id,
        thumbnailUrl: p?.thumbnailUrl ?? null,
        revenue: r.revenue,
        orders: r.orders,
        roas: r.ad_spend > 0 ? Math.round((r.revenue / r.ad_spend) * 100) / 100 : null,
      };
    });
  }
}
