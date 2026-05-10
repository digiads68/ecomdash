import { Injectable } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { ClickHouseService } from "../metrics/clickhouse.service";

type HealthScore = "good" | "normal" | "warning" | "poor";

function calcHealth(roas: number): HealthScore {
  if (roas >= 3) return "good";
  if (roas >= 1.5) return "normal";
  if (roas >= 1) return "warning";
  return "poor";
}

@Injectable()
export class ProductsService {
  constructor(private readonly ch: ClickHouseService) {}

  async getAnalytics(shopId: string, from: string, to: string, sortBy = "revenue") {
    // Fetch entity data from PostgreSQL
    const products = await prisma.product.findMany({
      where: { shopId },
      select: { tiktokProductId: true, name: true, thumbnailUrl: true },
    });
    const productMap = new Map(products.map((p) => [p.tiktokProductId, p]));

    // Fetch GMV per product from ClickHouse (rows where dimensions has product_id)
    const gmvRows = await this.ch.query<{ product_id: string; gmv: number }>(
      `SELECT dimensions['product_id'] AS product_id, sum(value) AS gmv
       FROM metrics_local
       WHERE shop_id = {shopId:String}
         AND metric_name = 'gmv'
         AND dimensions['product_id'] != ''
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       GROUP BY product_id
       FORMAT JSONEachRow`,
      { shopId, from, to }
    );

    // Fetch order count per product
    const orderRows = await this.ch.query<{ product_id: string; orders: number }>(
      `SELECT dimensions['product_id'] AS product_id, sum(value) AS orders
       FROM metrics_local
       WHERE shop_id = {shopId:String}
         AND metric_name = 'order_count'
         AND dimensions['product_id'] != ''
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       GROUP BY product_id
       FORMAT JSONEachRow`,
      { shopId, from, to }
    );

    // Total ad spend for shop (no product-level ad attribution)
    const spendRows = await this.ch.query<{ total: number }>(
      `SELECT sum(value) AS total
       FROM metrics_local
       WHERE shop_id = {shopId:String}
         AND metric_name = 'ad_spend'
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       FORMAT JSONEachRow`,
      { shopId, from, to }
    );
    const totalAdSpend = Number(spendRows[0]?.total ?? 0);
    const totalGmvRows = await this.ch.query<{ total: number }>(
      `SELECT sum(value) AS total
       FROM metrics_local
       WHERE shop_id = {shopId:String}
         AND metric_name = 'gmv'
         AND dimensions['product_id'] = ''
         AND timestamp >= {from:String}
         AND timestamp < {to:String}
       FORMAT JSONEachRow`,
      { shopId, from, to }
    );
    const totalGmv = Number(totalGmvRows[0]?.total ?? 0);

    const gmvMap = new Map(gmvRows.map((r) => [r.product_id, Number(r.gmv)]));
    const orderMap = new Map(orderRows.map((r) => [r.product_id, Number(r.orders)]));

    const result = Array.from(gmvMap.entries()).map(([productId, gmv]) => {
      const orders = orderMap.get(productId) ?? 0;
      // Apportion ad spend by GMV share
      const gmvShare = totalGmv > 0 ? gmv / totalGmv : 0;
      const adSpend = totalAdSpend * gmvShare;
      const roas = adSpend > 0 ? gmv / adSpend : gmv > 0 ? 99 : 0;
      const info = productMap.get(productId);

      return {
        id: productId,
        name: info?.name ?? `Sản phẩm ${productId.slice(-6)}`,
        imageUrl: info?.thumbnailUrl ?? null,
        gmv,
        orders,
        adSpend,
        roas,
        healthScore: calcHealth(roas),
      };
    });

    // Sort
    if (sortBy === "roas") result.sort((a, b) => b.roas - a.roas);
    else if (sortBy === "orders") result.sort((a, b) => b.orders - a.orders);
    else result.sort((a, b) => b.gmv - a.gmv);

    return { products: result };
  }
}
