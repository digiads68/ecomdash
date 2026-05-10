import { Injectable } from "@nestjs/common";
import { ClickHouseService } from "../metrics/clickhouse.service";

@Injectable()
export class CustomersService {
  constructor(private readonly ch: ClickHouseService) {}

  async getSummary(shopId: string, from: string, to: string) {
    // Unique buyers in period
    const rows = await this.ch.query<{ buyer_id: string; order_count: number; total_spend: number; last_order: string }>(
      `SELECT
         dimensions['buyer_id'] AS buyer_id,
         count() AS order_count,
         sum(value) AS total_spend,
         max(timestamp) AS last_order
       FROM metrics_local
       WHERE shop_id = {shopId:String}
         AND metric_name = 'gmv'
         AND dimensions['buyer_id'] != ''
         AND dimensions['product_id'] = ''
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       GROUP BY buyer_id
       FORMAT JSONEachRow`,
      { shopId, from, to }
    );

    const totalBuyers = rows.length;
    const returningBuyers = rows.filter((r) => Number(r.order_count) > 1).length;
    const newBuyers = totalBuyers - returningBuyers;

    return {
      totalBuyers,
      newBuyers,
      returningBuyers,
      returningRate: totalBuyers > 0 ? returningBuyers / totalBuyers : 0,
    };
  }

  async getTopBuyers(shopId: string, from: string, to: string, limit = 20) {
    const rows = await this.ch.query<{ buyer_id: string; order_count: number; total_spend: number; last_order: string }>(
      `SELECT
         dimensions['buyer_id'] AS buyer_id,
         count() AS order_count,
         sum(value) AS total_spend,
         max(timestamp) AS last_order
       FROM metrics_local
       WHERE shop_id = {shopId:String}
         AND metric_name = 'gmv'
         AND dimensions['buyer_id'] != ''
         AND dimensions['product_id'] = ''
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       GROUP BY buyer_id
       ORDER BY total_spend DESC
       LIMIT {limit:UInt32}
       FORMAT JSONEachRow`,
      { shopId, from, to, limit }
    );

    return {
      customers: rows.map((r, i) => ({
        anonymousId: `Khách #${String(i + 1).padStart(4, "0")}`,
        orderCount: Number(r.order_count),
        totalSpend: Number(r.total_spend),
        lastOrderDate: r.last_order,
      })),
    };
  }
}
