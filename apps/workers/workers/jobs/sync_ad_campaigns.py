"""Sync TikTok Ads campaigns to PostgreSQL for name enrichment."""
import logging
import os
import json
import httpx
import asyncpg
from workers.crypto import decrypt_token

logger = logging.getLogger(__name__)
ADS_API = "https://business-api.tiktok.com/open_api/v1.3"


async def run_sync_ad_campaigns():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        accounts = await conn.fetch(
            'SELECT id, "tiktokAdvertiserId", "accessTokenEncrypted" '
            'FROM "AdAccount" WHERE "syncStatus" != \'ERROR\''
        )
        for account in accounts:
            try:
                await _sync_campaigns_for_account(conn, account)
            except Exception as e:
                logger.error(f"Campaign sync failed for account {account['id']}: {e}")
    finally:
        await conn.close()


async def _sync_campaigns_for_account(conn, account):
    token = decrypt_token(account["accessTokenEncrypted"])
    page, total = 1, 0
    async with httpx.AsyncClient(timeout=30) as client:
        while True:
            resp = await client.get(f"{ADS_API}/campaign/get/",
                headers={"Access-Token": token},
                params={"advertiser_id": account["tiktokAdvertiserId"],
                        "fields": json.dumps(["campaign_id","campaign_name","status","objective_type"]),
                        "page": page, "page_size": 100})
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") != 0:
                logger.error(f"TikTok campaigns API error: {data.get('message')}"); break
            for c in data.get("data", {}).get("list", []):
                # Campaign schema: id, adAccountId, tiktokCampaignId, name, status, objective, createdAt, updatedAt
                await conn.execute(
                    """INSERT INTO "Campaign"
                         (id, "adAccountId", "tiktokCampaignId", name, status, objective, "createdAt", "updatedAt")
                       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
                       ON CONFLICT ("tiktokCampaignId")
                       DO UPDATE SET name=EXCLUDED.name, status=EXCLUDED.status,
                                     objective=EXCLUDED.objective, "updatedAt"=NOW()""",
                    account["id"], str(c["campaign_id"]), c.get("campaign_name",""),
                    c.get("status","ENABLE"), c.get("objective_type"),
                )
                total += 1
            total_pages = data.get("data",{}).get("page_info",{}).get("total_page",1)
            if page >= total_pages: break
            page += 1
    logger.info(f"Synced {total} campaigns for account {account['id']}")
