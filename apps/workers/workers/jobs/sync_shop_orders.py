"""Sync TikTok Shop orders → ClickHouse metrics_local.

Pattern for all sync jobs:
1. Load active shops from PostgreSQL
2. Decrypt access token
3. Fetch from TikTok API (with retry on 429)
4. Batch insert to ClickHouse
5. Update shop.lastSyncedAt + syncStatus
"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
import httpx
import asyncpg
from workers.clickhouse import insert_metrics
from workers.crypto import decrypt_token

logger = logging.getLogger(__name__)
TIKTOK_SHOP_BASE = "https://open-api.tiktokglobalshop.com"


async def fetch_orders(access_token: str, shop_id: str, since: datetime) -> list[dict]:
    """Fetch orders from TikTok Shop API with exponential backoff on 429."""
    headers = {"x-tts-access-token": access_token}
    params = {
        "page_size": 100,
        "create_time_ge": int(since.timestamp()),
        "create_time_lt": int(datetime.now(timezone.utc).timestamp()),
    }
    rows = []
    retries = 0
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                f"{TIKTOK_SHOP_BASE}/order/202309/orders/search",
                headers=headers,
                params=params,
            )
            if resp.status_code == 429:
                wait = 2 ** retries
                logger.warning(f"Rate limited, waiting {wait}s")
                await asyncio.sleep(min(wait, 64))
                retries += 1
                continue
            resp.raise_for_status()
            data = resp.json().get("data", {})
            rows.extend(data.get("orders", []))
            if not data.get("next_page_token"):
                break
            params["page_token"] = data["next_page_token"]
    return rows


async def run_sync_shop_orders():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        shops = await conn.fetch(
            "SELECT id, organization_id AS tenant_id, tiktok_shop_id, "
            "access_token_encrypted, token_expires_at, last_synced_at "
            "FROM shops WHERE sync_status != 'ERROR'"
        )

        for shop in shops:
            since = shop["last_synced_at"] or (datetime.now(timezone.utc) - timedelta(days=30))
            try:
                token = decrypt_token(shop["access_token_encrypted"])
                orders = await fetch_orders(token, shop["tiktok_shop_id"], since)

                ch_rows = []
                for order in orders:
                    ts = datetime.fromtimestamp(order["create_time"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                    gmv = float(order.get("payment", {}).get("total_amount", 0))
                    ch_rows.append({
                        "tenant_id": shop["tenant_id"],
                        "shop_id": shop["id"],
                        "metric_name": "gmv",
                        "timestamp": ts,
                        "value": gmv,
                        "dimensions": {},
                    })
                    ch_rows.append({
                        "tenant_id": shop["tenant_id"],
                        "shop_id": shop["id"],
                        "metric_name": "order_count",
                        "timestamp": ts,
                        "value": 1.0,
                        "dimensions": {},
                    })

                await insert_metrics(ch_rows)
                await conn.execute(
                    "UPDATE shops SET sync_status='SYNCED', last_synced_at=$1 WHERE id=$2",
                    datetime.now(timezone.utc), shop["id"],
                )
                logger.info(f"Synced {len(orders)} orders for shop {shop['id']}")
            except Exception as e:
                logger.error(f"Error syncing shop {shop['id']}: {e}")
                await conn.execute(
                    "UPDATE shops SET sync_status='ERROR' WHERE id=$1", shop["id"]
                )
    finally:
        await conn.close()
