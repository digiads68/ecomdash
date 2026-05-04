import { Injectable } from "@nestjs/common";
import { ClickHouseService } from "../metrics/clickhouse.service";

@Injectable()
export class AdsService {
  constructor(private readonly ch: ClickHouseService) {}

  async getBudgetForecast(adAccountId: string, month: string) {
    // month format: "YYYY-MM"
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const now = new Date();
    const daysElapsed = now.getFullYear() === year && now.getMonth() + 1 === mon
      ? now.getDate()
      : daysInMonth;

    const from = `${month}-01 00:00:00`;
    const to = `${month}-${String(daysInMonth).padStart(2, "0")} 23:59:59`;

    // Daily ad spend for this ad account
    const rows = await this.ch.query<{ date: string; spend: number }>(
      `SELECT toDate(timestamp) AS date, sum(value) AS spend
       FROM metrics_local
       WHERE dimensions['ad_account_id'] = {adAccountId:String}
         AND metric_name = 'ad_spend'
         AND timestamp >= {from:String}
         AND timestamp <= {to:String}
       GROUP BY date
       ORDER BY date ASC
       FORMAT JSONEachRow`,
      { adAccountId, from, to }
    );

    const dailySpend = rows.map((r) => Number(r.spend));
    const currentSpend = dailySpend.reduce((a, b) => a + b, 0);
    const dailyAverage = daysElapsed > 0 ? currentSpend / daysElapsed : 0;
    const projectedSpend = dailyAverage * daysInMonth;

    return {
      currentSpend,
      projectedSpend,
      daysElapsed,
      daysInMonth,
      dailyAverage,
      dailyData: rows,
    };
  }
}
