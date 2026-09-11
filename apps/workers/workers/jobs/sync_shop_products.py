"""Sync TikTok Shop products to PostgreSQL."""
import logging
import os
from datetime import datetime, timezone
import asyncpg
import httpx
from workers.crypto import decrypt_token

logger = logging.getLogger(__name__)
SHOP_API = "https://open-api.tiktokglobalshop.com"


async def run_sync_shop_products():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        shops = await conn.fetch(
            'SELECT id, "tiktokShopId", "accessTokenEncrypted", "tokenExpiresAt" '
            'FROM "Shop" WHERE "syncStatus" != \'ERROR\''
        )
        for shop in shops:
            try:
                await _sync_products_for_shop(conn, shop)
            except Exception as e:
                logger.error(f"Product sync failed for shop {shop['id']}: {e}")
    finally:
        await conn.close()


async def _sync_products_for_shop(conn, shop):
    token = decrypt_token(shop["accessTokenEncrypted"])
    page_token = None
    total = 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            params = {"shop_id": shop["tiktokShopId"], "page_size": 100, "status": "ACTIVE"}
            if page_token:
                params["page_token"] = page_token
            resp = await client.get(f"{SHOP_API}/product/202309/products",
                                    headers={"x-tts-access-token": token}, params=params)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") != 0:
                logger.error(f"TikTok products API error: {data.get('message')}"); break
            for p in data.get("data", {}).get("products", []):
                images = p.get("main_images") or p.get("images", [])
                thumbnail = images[0].get("url_list", [None])[0] if images else None
                # Product schema: id, shopId, tiktokProductId, name, thumbnailUrl, status, createdAt, updatedAt
                await conn.execute(
                    """INSERT INTO "Product"
                         (id, "shopId", "tiktokProductId", name, "thumbnailUrl", status, "createdAt", "updatedAt")
                       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
                       ON CONFLICT ("tiktokProductId")
                       DO UPDATE SET name=EXCLUDED.name, "thumbnailUrl"=EXCLUDED."thumbnailUrl",
                                     status=EXCLUDED.status, "updatedAt"=NOW()""",
                    shop["id"], p["id"], p.get("title") or p.get("name", ""), thumbnail,
                    p.get("status", "ACTIVE"),
                )
                total += 1
            next_page = data.get("data", {}).get("next_page_token")
            if not next_page: break
            page_token = next_page
    logger.info(f"Synced {total} products for shop {shop['id']}")
