"""Sync TikTok Shop orders → ClickHouse metrics_local."""
import asyncio
import hashlib
import logging
import os
from datetime import datetime, timezone, timedelta
import httpx
import asyncpg
from workers.clickhouse import insert_metrics
from workers.crypto import decrypt_token

logger = logging.getLogger(__name__)
TIKTOK_SHOP_BASE = "https://open-api.tiktokglobalshop.com"

STATUS_METRIC_MAP = {
    "DELIVERED": "order_delivered", "COMPLETED": "order_delivered",
    "IN_TRANSIT": "order_processing", "AWAITING_SHIPMENT": "order_processing",
    "AWAITING_COLLECTION": "order_processing", "CANCELLED": "order_cancelled",
    "CANCEL_FAILED": "order_cancelled", "PARTIALLY_RETURNING": "order_returned",
    "RETURNING": "order_returned", "RETURNED": "order_returned",
}


def _hash_buyer_id(buyer_id: str) -> str:
    return hashlib.sha256(buyer_id.encode()).hexdigest()[:16]


async def fetch_orders(access_token: str, shop_id: str, since: datetime) -> list[dict]:
    headers = {"x-tts-access-token": access_token}
    params = {"page_size": 100, "create_time_ge": int(since.timestamp()),
              "create_time_lt": int(datetime.now(timezone.utc).timestamp())}
    rows = []
    retries = 0
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(f"{TIKTOK_SHOP_BASE}/order/202309/orders/search",
                                    headers=headers, params=params)
            if resp.status_code == 429:
                await asyncio.sleep(min(2 ** retries, 64)); retries += 1; continue
            resp.raise_for_status()
            data = resp.json().get("data", {})
            rows.extend(data.get("orders", []))
            if not data.get("next_page_token"): break
            params["page_token"] = data["next_page_token"]
    return rows


def _build_metric_rows(order: dict, tenant_id: str, shop_id: str) -> list[dict]:
    ts = datetime.fromtimestamp(order["create_time"], tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    gmv = float(order.get("payment", {}).get("total_amount", 0))
    buyer_hash = _hash_buyer_id(str(order.get("buyer_uid") or order.get("buyer_id") or "unknown"))
    status = str(order.get("status", "UNKNOWN")).upper()
    base_dims = {"buyer_id": buyer_hash, "order_status": status}

    rows = [
        {"tenant_id": tenant_id, "shop_id": shop_id, "metric_name": "gmv",
         "timestamp": ts, "value": gmv, "dimensions": base_dims},
        {"tenant_id": tenant_id, "shop_id": shop_id, "metric_name": "order_count",
         "timestamp": ts, "value": 1.0, "dimensions": base_dims},
        {"tenant_id": tenant_id, "shop_id": shop_id,
         "metric_name": STATUS_METRIC_MAP.get(status, "order_processing"),
         "timestamp": ts, "value": 1.0, "dimensions": base_dims},
    ]
    for item in order.get("line_items", []):
        pid = str(item.get("product_id") or "")
        if pid:
            rows.append({"tenant_id": tenant_id, "shop_id": shop_id, "metric_name": "gmv",
                         "timestamp": ts,
                         "value": float(item.get("sale_price", 0)) * int(item.get("quantity", 1)),
                         "dimensions": {**base_dims, "product_id": pid}})
    return rows


async def run_sync_shop_orders():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        shops = await conn.fetch(
            'SELECT id, "organizationId" AS tenant_id, "tiktokShopId", '
            '"accessTokenEncrypted", "lastSyncedAt" '
            'FROM "Shop" WHERE "syncStatus" != \'ERROR\''
        )
        for shop in shops:
            since = shop["lastSyncedAt"] or (datetime.now(timezone.utc) - timedelta(days=30))
            try:
                orders = await fetch_orders(decrypt_token(shop["accessTokenEncrypted"]),
                                            shop["tiktokShopId"], since)
                ch_rows = [r for o in orders for r in _build_metric_rows(o, shop["tenant_id"], shop["id"])]
                await insert_metrics(ch_rows)
                await conn.execute('UPDATE "Shop" SET "syncStatus"=\'SYNCED\', "lastSyncedAt"=$1 WHERE id=$2',
                                   datetime.now(timezone.utc), shop["id"])
                logger.info(f"Synced {len(orders)} orders for shop {shop['id']}")
            except Exception as e:
                logger.error(f"Error syncing shop {shop['id']}: {e}")
                await conn.execute('UPDATE "Shop" SET "syncStatus"=\'ERROR\' WHERE id=$1', shop["id"])
    finally:
        await conn.close()
