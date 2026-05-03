"""Sync TikTok Shop products to PostgreSQL for name/thumbnail enrichment."""
import logging
import os
from datetime import datetime, timezone
import asyncpg
import httpx
from workers.crypto import decrypt_token

logger = logging.getLogger(__name__)

SHOP_API = "https://open-api.tiktokglobalshop.com"


async def _refresh_if_needed(conn, shop) -> str:
    """Return valid access token, refreshing if close to expiry."""
    expires_at = shop["token_expires_at"]
    if expires_at and (expires_at - datetime.now(timezone.utc)).total_seconds() < 300:
        # Token refresh would go here — for now just return current token
        pass
    return decrypt_token(shop["access_token_encrypted"])


async def run_sync_shop_products():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        shops = await conn.fetch(
            """SELECT id, organization_id, tiktok_shop_id,
                      access_token_encrypted, token_expires_at
               FROM shops WHERE sync_status != 'ERROR'"""
        )
        for shop in shops:
            try:
                await _sync_products_for_shop(conn, shop)
            except Exception as e:
                logger.error(f"Product sync failed for shop {shop['id']}: {e}")
    finally:
        await conn.close()


async def _sync_products_for_shop(conn, shop):
    token = await _refresh_if_needed(conn, shop)
    shop_id = shop["tiktok_shop_id"]
    org_id = shop["organization_id"]

    page_token = None
    total_synced = 0

    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            params = {
                "shop_id": shop_id,
                "page_size": 100,
                "status": "ACTIVE",
            }
            if page_token:
                params["page_token"] = page_token

            resp = await client.get(
                f"{SHOP_API}/product/202309/products",
                headers={"x-tts-access-token": token},
                params=params,
            )
            resp.raise_for_status()
            data = resp.json()

            if data.get("code") != 0:
                logger.error(f"TikTok products API error: {data.get('message')}")
                break

            products = data.get("data", {}).get("products", [])
            for p in products:
                thumbnail = None
                images = p.get("main_images") or p.get("images", [])
                if images:
                    thumbnail = images[0].get("url_list", [None])[0]

                await conn.execute(
                    """INSERT INTO products
                         (id, organization_id, shop_id, tiktok_product_id, name, thumbnail_url,
                          status, created_at, updated_at)
                       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
                       ON CONFLICT (tiktok_product_id)
                       DO UPDATE SET name = EXCLUDED.name,
                                     thumbnail_url = EXCLUDED.thumbnail_url,
                                     status = EXCLUDED.status,
                                     updated_at = NOW()""",
                    org_id,
                    shop["id"],
                    p["id"],
                    p.get("title") or p.get("name", ""),
                    thumbnail,
                    p.get("status", "ACTIVE"),
                )
                total_synced += 1

            next_page = data.get("data", {}).get("next_page_token")
            if not next_page:
                break
            page_token = next_page

    logger.info(f"Synced {total_synced} products for shop {shop['id']}")
