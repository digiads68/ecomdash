import { Controller, Get, Query, Req } from "@nestjs/common";
import { ClickHouseService } from "./clickhouse.service";
import { MetricsService } from "./metrics.service";

function parseDate(val: string | undefined, fallback: Date): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

@Controller("metrics")
export class MetricsController {
  constructor(
    private readonly metricsService: MetricsService,
    private readonly ch: ClickHouseService
  ) {}

  @Get("overview")
  async overview(
    @Req() req: any,
    @Query("shopId") shopId: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const now = new Date();
    const toDate = parseDate(to, now);
    const fromDate = parseDate(from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

    return this.metricsService.getOverview(req.orgId, shopId, fromDate, toDate);
  }

  @Get("revenue-trend")
  async revenueTrend(
    @Req() req: any,
    @Query("shopId") shopId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("granularity") granularity: "hour" | "day" = "day"
  ) {
    const now = new Date();
    const toDate = parseDate(to, now);
    const fromDate = parseDate(from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

    return this.metricsService.getRevenueTrend(req.orgId, shopId, fromDate, toDate, granularity);
  }

  @Get("top-products")
  async topProducts(
    @Req() req: any,
    @Query("shopId") shopId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit = "10"
  ) {
    const now = new Date();
    const toDate = parseDate(to, now);
    const fromDate = parseDate(from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

    return this.metricsService.getTopProducts(req.orgId, shopId, fromDate, toDate, parseInt(limit));
  }

  @Get("orders")
  async orders(
    @Req() req: any,
    @Query("shopId") shopId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit = "20"
  ) {
    const now = new Date();
    const toDate = parseDate(to, now);
    const fromDate = parseDate(from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const shopFilter = shopId ? `AND shop_id = {shopId:String}` : "";

    const rows = await this.ch.query<{ date: string; revenue: number; orders: number }>(
      `SELECT
         toDate(timestamp) AS date,
         sumIf(value, metric_name = 'gmv') AS revenue,
         sumIf(value, metric_name = 'order_count') AS orders
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         ${shopFilter}
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
         AND metric_name IN ('gmv', 'order_count')
       GROUP BY date
       ORDER BY date DESC
       LIMIT {limit:UInt32}`,
      {
        orgId: req.orgId,
        shopId: shopId ?? "",
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        limit: parseInt(limit),
      }
    );
    return rows;
  }

  @Get("shop-summary")
  async shopSummary(
    @Req() req: any,
    @Query("shopId") shopId: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const now = new Date();
    const toDate = parseDate(to, now);
    const fromDate = parseDate(from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    return this.metricsService.getShopSummary(req.orgId, shopId, fromDate, toDate);
  }
}
