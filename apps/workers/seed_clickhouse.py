"""Seed ClickHouse with 30 days of realistic synthetic metrics for demo.

Run: python seed_clickhouse.py
Requires: ClickHouse running on localhost:8123 (docker compose up -d)
"""
import json
import random
from datetime import datetime, timedelta, timezone
import httpx

CLICKHOUSE_HOST = "http://localhost:8123"
DB = "ecomdash"

# Match seed.ts demo IDs
TENANT_ID = "demo-org-id"  # will be overridden by actual DB org id
SHOP_ID = "demo-shop-id"   # will be overridden by actual DB shop id

CAMPAIGNS = [
    "camp_demo_1",
    "camp_demo_2",
    "camp_demo_3",
    "camp_demo_4",
    "camp_demo_5",
]

PRODUCTS = [f"prod_demo_{i+1}" for i in range(8)]


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

        # Spread revenue across hours (peak 10am-2pm, 8pm-10pm)
        for hour in range(24):
            peak = 1.0
            if 10 <= hour <= 14:
                peak = 2.5
            elif 20 <= hour <= 22:
                peak = 2.0
            elif 0 <= hour <= 6:
                peak = 0.2

            ts = day_dt.replace(hour=hour, minute=0, second=0, microsecond=0)
            ts_str = ts.strftime("%Y-%m-%d %H:%M:%S")

            # Hourly shop metrics
            hour_gmv = (daily_revenue / 24) * peak * random.uniform(0.6, 1.4)
            hour_orders = max(0, int((daily_orders / 24) * peak * random.uniform(0.5, 1.5)))

            # Distribute across products (first 3 products get 60% of revenue)
            for i, prod_id in enumerate(PRODUCTS):
                share = 0.25 if i < 3 else 0.075
                prod_gmv = hour_gmv * share * random.uniform(0.8, 1.2)
                prod_orders = max(0, round(hour_orders * share))

                rows.append({
                    "tenant_id": tenant_id,
                    "shop_id": shop_id,
                    "metric_name": "gmv",
                    "timestamp": ts_str,
                    "value": round(prod_gmv, 2),
                    "dimensions": {"product_id": prod_id},
                })
                rows.append({
                    "tenant_id": tenant_id,
                    "shop_id": shop_id,
                    "metric_name": "order_count",
                    "timestamp": ts_str,
                    "value": float(prod_orders),
                    "dimensions": {"product_id": prod_id},
                })

        # Daily ad metrics spread across campaigns
        for camp_id in CAMPAIGNS:
            camp_spend = (daily_ad_spend / len(CAMPAIGNS)) * random.uniform(0.5, 1.5)
            camp_impressions = int(camp_spend / random.uniform(50, 150))
            camp_clicks = int(camp_impressions * random.uniform(0.01, 0.05))
            camp_conversions = max(0, int(camp_clicks * random.uniform(0.02, 0.1)))

            ts_str = day_dt.replace(hour=12, minute=0, second=0, microsecond=0).strftime("%Y-%m-%d %H:%M:%S")

            for metric_name, value in [
                ("ad_spend", camp_spend),
                ("impressions", float(camp_impressions)),
                ("clicks", float(camp_clicks)),
                ("conversions", float(camp_conversions)),
            ]:
                rows.append({
                    "tenant_id": tenant_id,
                    "shop_id": shop_id,
                    "metric_name": metric_name,
                    "timestamp": ts_str,
                    "value": round(value, 2),
                    "dimensions": {"campaign_id": camp_id},
                })

    return rows


def insert_rows(rows: list[dict]):
    body = "\n".join(json.dumps(r) for r in rows)
    resp = httpx.post(
        CLICKHOUSE_HOST,
        params={"query": f"INSERT INTO {DB}.metrics_local FORMAT JSONEachRow"},
        content=body.encode(),
        headers={"Content-Type": "text/plain"},
        timeout=30,
    )
    resp.raise_for_status()


def main():
    import sys
    tenant_id = sys.argv[1] if len(sys.argv) > 1 else TENANT_ID
    shop_id = sys.argv[2] if len(sys.argv) > 2 else SHOP_ID

    print(f"Seeding ClickHouse: tenant={tenant_id}, shop={shop_id}")
    rows = generate_rows(tenant_id, shop_id)
    print(f"Generated {len(rows)} rows, inserting...")
    # Insert in batches of 5000
    for i in range(0, len(rows), 5000):
        insert_rows(rows[i:i+5000])
        print(f"  Inserted {min(i+5000, len(rows))}/{len(rows)}")
    print("✅ ClickHouse seed complete!")


if __name__ == "__main__":
    main()
