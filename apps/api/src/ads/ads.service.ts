import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { ClickHouseService } from "../metrics/clickhouse.service";

@Injectable()
export class AdsService {
  constructor(private readonly ch: ClickHouseService) {}

  async getBudgetForecast(adAccountId: string, month: string, orgId?: string) {
    // month format: "YYYY-MM"
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const now = new Date();
    const daysElapsed =
      now.getFullYear() === year && now.getMonth() + 1 === mon
        ? now.getDate()
        : daysInMonth;

    // Resolve shopId from adAccountId (ad metrics are stored by shop_id)
    const where = orgId
      ? { tiktokAdvertiserId: adAccountId, organizationId: orgId }
      : { tiktokAdvertiserId: adAccountId };
    const adAccount = await prisma.adAccount.findFirst({ where, select: { shopId: true } });

    // Fall back to querying by adAccountId directly if not found by tiktokAdvertiserId
    const shopId = adAccount?.shopId;
    if (!shopId) {
      // Try by internal ID
      const byId = await prisma.adAccount.findFirst({
        where: orgId ? { id: adAccountId, organizationId: orgId } : { id: adAccountId },
        select: { shopId: true },
      });
      if (!byId?.shopId) throw new NotFoundException("Ad account not found");
      return this._forecast(byId.shopId, month, year, mon, daysInMonth, daysElapsed);
    }

    return this._forecast(shopId, month, year, mon, daysInMonth, daysElapsed);
  }

  private async _forecast(
    shopId: string,
    month: string,
    year: number,
    mon: number,
    daysInMonth: number,
    daysElapsed: number,
  ) {
    const from = `${month}-01 00:00:00`;
    const to = `${month}-${String(daysInMonth).padStart(2, "0")} 23:59:59`;

    const rows = await this.ch.query<{ date: string; spend: number }>(
      `SELECT toDate(timestamp) AS date, sum(value) AS spend
       FROM metrics_local
       WHERE shop_id = {shopId:String}
         AND metric_name = 'ad_spend'
         AND timestamp >= {from:String}
         AND timestamp <= {to:String}
       GROUP BY date
       ORDER BY date ASC
       FORMAT JSONEachRow`,
      { shopId, from, to }
    );

    const dailySpend = rows.map((r) => Number(r.spend));
    const currentSpend = dailySpend.reduce((a, b) => a + b, 0);
    const dailyAverage = daysElapsed > 0 ? currentSpend / daysElapsed : 0;
    const projectedSpend = this._linearForecast(dailySpend, daysInMonth);

    return {
      currentSpend,
      projectedSpend,
      daysElapsed,
      daysInMonth,
      dailyAverage,
    };
  }

  // Linear regression on cumulative spend to project end-of-month total
  private _linearForecast(dailySpend: number[], daysInMonth: number): number {
    const n = dailySpend.length;
    if (n === 0) return 0;
    if (n === 1) return dailySpend[0] * daysInMonth;

    let cumSum = 0;
    const cumulative = dailySpend.map((d) => (cumSum += d));

    const xs = Array.from({ length: n }, (_, i) => i + 1);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = cumulative.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((acc, x, i) => acc + x * cumulative[i], 0);
    const sumXX = xs.reduce((acc, x) => acc + x * x, 0);

    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return cumulative[n - 1];

    const b = (n * sumXY - sumX * sumY) / denom;
    const a = (sumY - b * sumX) / n;

    return Math.max(a + b * daysInMonth, cumulative[n - 1]);
  }
}
