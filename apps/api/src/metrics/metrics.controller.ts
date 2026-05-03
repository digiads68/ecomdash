import { Controller, Get, Query, Req } from "@nestjs/common";
import { MetricsService } from "./metrics.service";

function parseDate(val: string | undefined, fallback: Date): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

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
}
