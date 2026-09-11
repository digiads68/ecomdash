import { Injectable } from "@nestjs/common";
import { ClickHouseService } from "../metrics/clickhouse.service";

@Injectable()
export class OrdersService {
  constructor(private readonly ch: ClickHouseService) {}

  async getSummary(orgId: string, shopId: string, from: string, to: string) {
    const rows = await this.ch.query<{ metric_name: string; total: number }>(
      `SELECT metric_name, sum(value) AS total
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         AND shop_id = {shopId:String}
         AND metric_name IN ('order_count','order_delivered','order_processing','order_cancelled','order_returned')
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       GROUP BY metric_name
       FORMAT JSONEachRow`,
      { orgId, shopId, from, to }
    );

    const map: Record<string, number> = {};
    for (const r of rows) map[r.metric_name] = Number(r.total);

    const total = map["order_count"] ?? 0;
    const delivered = map["order_delivered"] ?? 0;
    const processing = map["order_processing"] ?? 0;
    const cancelled = map["order_cancelled"] ?? 0;
    const returned = map["order_returned"] ?? 0;

    return {
      total,
      delivered,
      processing,
      cancelled,
      returned,
      returnRate: total > 0 ? returned / total : 0,
      cancellationRate: total > 0 ? cancelled / total : 0,
    };
  }

  async getTrend(orgId: string, shopId: string, from: string, to: string) {
    const rows = await this.ch.query<{ date: string; metric_name: string; total: number }>(
      `SELECT toDate(timestamp) AS date, metric_name, sum(value) AS total
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         AND shop_id = {shopId:String}
         AND metric_name IN ('order_delivered','order_processing','order_cancelled','order_returned')
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       GROUP BY date, metric_name
       ORDER BY date ASC
       FORMAT JSONEachRow`,
      { orgId, shopId, from, to }
    );

    // Pivot by date
    const byDate: Record<string, { date: string; delivered: number; processing: number; cancelled: number; returned: number }> = {};
    for (const r of rows) {
      const d = r.date;
      if (!byDate[d]) byDate[d] = { date: d, delivered: 0, processing: 0, cancelled: 0, returned: 0 };
      if (r.metric_name === "order_delivered") byDate[d].delivered += Number(r.total);
      if (r.metric_name === "order_processing") byDate[d].processing += Number(r.total);
      if (r.metric_name === "order_cancelled") byDate[d].cancelled += Number(r.total);
      if (r.metric_name === "order_returned") byDate[d].returned += Number(r.total);
    }

    return { data: Object.values(byDate) };
  }
}
