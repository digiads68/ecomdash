"""Seed ClickHouse with 30 days of realistic synthetic metrics for demo.

Run: python seed_clickhouse.py [tenant_id] [shop_id]
Requires: ClickHouse running on localhost:8123 (docker compose up -d)
"""
import hashlib
import json
import random
from datetime import datetime, timedelta, timezone
import httpx

CLICKHOUSE_HOST = "http://localhost:8123"
DB = "ecomdash"

# Match seed.ts demo IDs — overridden by CLI args
TENANT_ID = "demo-org-id"
SHOP_ID = "demo-shop-id"

CAMPAIGNS = [f"camp_demo_{i+1}" for i in range(5)]
PRODUCTS = [f"prod_demo_{i+1}" for i in range(8)]

# Pool of synthetic buyer IDs (hashed for privacy, as the real worker does)
BUYER_POOL = [
    hashlib.sha256(f"buyer_{i:04d}".encode()).hexdigest()[:16]
    for i in range(200)
]

# ~60% delivered, 20% processing, 12% cancelled, 8% returned
ORDER_STATUSES = ["DELIVERED"] * 6 + ["PROCESSING"] * 2 + ["CANCELLED"] + ["RETURNED"]
STATUS_TO_METRIC = {
    "DELIVERED": "order_delivered",
    "PROCESSING": "order_processing",
    "CANCELLED": "order_cancelled",
    "RETURNED": "order_returned",
}


def random_daily_revenue(day_offset: int) -> float:
    """Simulate realistic VN TikTok shop revenue with weekly pattern."""
    base = 3_000_000  # 3M VND base
    weekend_boost = 1.4 if day_offset % 7 in (5, 6) else 1.0
    trend = 1 + (day_offset / 30) * 0.2  # slight growth trend
    noise = random.uniform(0.7, 1.3)
    return base * weekend_boost * trend * noise


def generate_rows(tenant_id: str, shop_id: str) -> list[dict]:
    rows = []
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=30)

    for day in range(30):
        day_dt = start + timedelta(days=day)
        daily_revenue = random_daily_revenue(day)
        daily_orders = int(daily_revenue / random.uniform(200_000, 400_000))
        daily_ad_spend = daily_revenue / random.uniform(2.5, 5.0)

        # Per-order metrics (gmv, order_count, order_status, buyer_id, product_id)
        for _ in range(max(1, daily_orders)):
            buyer_id = random.choice(BUYER_POOL)
            status = random.choice(ORDER_STATUSES)
            status_metric = STATUS_TO_METRIC[status]
            order_value = (daily_revenue / max(1, daily_orders)) * random.uniform(0.5, 1.5)

            hour = random.choice([10, 11, 12, 13, 14, 15, 20, 21])
            ts_str = day_dt.replace(
                hour=hour, minute=random.randint(0, 59), second=0, microsecond=0
            ).strftime("%Y-%m-%d %H:%M:%S")

            base_dims = {"buyer_id": buyer_id, "order_status": status, "product_id": ""}

            # Shop-level GMV roll-up (product_id = "" for shop aggregation)
            rows.append({"tenant_id": tenant_id, "shop_id": shop_id,
                         "metric_name": "gmv", "timestamp": ts_str,
                         "value": round(order_value, 2), "dimensions": base_dims})
            rows.append({"tenant_id": tenant_id, "shop_id": shop_id,
                         "metric_name": "order_count", "timestamp": ts_str,
                         "value": 1.0, "dimensions": base_dims})
            rows.append({"tenant_id": tenant_id, "shop_id": shop_id,
                         "metric_name": status_metric, "timestamp": ts_str,
                         "value": 1.0, "dimensions": base_dims})

            # Per-product GMV from line items
            n_prods = random.choices([1, 2], weights=[0.7, 0.3])[0]
            chosen = random.sample(PRODUCTS, min(n_prods, len(PRODUCTS)))
            shares = [random.uniform(0.3, 0.7) for _ in chosen]
            total_share = sum(shares)
            for prod_id, share in zip(chosen, shares):
                prod_gmv = order_value * share / total_share
                prod_dims = {"buyer_id": buyer_id, "order_status": status, "product_id": prod_id}
                rows.append({"tenant_id": tenant_id, "shop_id": shop_id,
                             "metric_name": "gmv", "timestamp": ts_str,
                             "value": round(prod_gmv, 2), "dimensions": prod_dims})
                rows.append({"tenant_id": tenant_id, "shop_id": shop_id,
                             "metric_name": "order_count", "timestamp": ts_str,
                             "value": 1.0, "dimensions": prod_dims})

        # Daily ad metrics per campaign
        for camp_id in CAMPAIGNS:
            camp_spend = (daily_ad_spend / len(CAMPAIGNS)) * random.uniform(0.5, 1.5)
            camp_impressions = int(camp_spend / random.uniform(50, 150))
            camp_clicks = int(camp_impressions * random.uniform(0.01, 0.05))
            camp_conversions = max(0, int(camp_clicks * random.uniform(0.02, 0.1)))

            ts_str = day_dt.replace(hour=12, minute=0, second=0, microsecond=0).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            for metric_name, value in [
                ("ad_spend", camp_spend),
                ("impressions", float(camp_impressions)),
                ("clicks", float(camp_clicks)),
                ("conversions", float(camp_conversions)),
            ]:
                rows.append({
                    "tenant_id": tenant_id, "shop_id": shop_id,
                    "metric_name": metric_name, "timestamp": ts_str,
                    "value": round(value, 2),
                    "dimensions": {"campaign_id": camp_id, "product_id": "", "buyer_id": "", "order_status": ""},
                })

    return rows


def insert_rows(rows: list[dict]):
    body = "\n".join(json.dumps(r) for r in rows)
    resp = httpx.post(
        CLICKHOUSE_HOST,
        params={"query": f"INSERT INTO {DB}.metrics_local FORMAT JSONEachRow"},
        content=body.encode(),
        headers={"Content-Type": "text/plain"},
        timeout=60,
    )
    resp.raise_for_status()


def main():
    import sys
    tenant_id = sys.argv[1] if len(sys.argv) > 1 else TENANT_ID
    shop_id = sys.argv[2] if len(sys.argv) > 2 else SHOP_ID

    print(f"Seeding ClickHouse: tenant={tenant_id}, shop={shop_id}")
    rows = generate_rows(tenant_id, shop_id)
    print(f"Generated {len(rows)} rows, inserting...")
    batch_size = 5000
    for i in range(0, len(rows), batch_size):
        insert_rows(rows[i : i + batch_size])
        print(f"  Inserted {min(i + batch_size, len(rows))}/{len(rows)}")
    print("✅ ClickHouse seed complete!")
    print("   Metrics: gmv, order_count, order_delivered, order_processing,")
    print("            order_cancelled, order_returned, ad_spend, impressions, clicks, conversions")
    print("   Dimensions: buyer_id (hashed), order_status, product_id, campaign_id")


if __name__ == "__main__":
    main()
