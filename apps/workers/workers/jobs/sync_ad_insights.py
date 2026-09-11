"""Sync TikTok Ads daily insights → ClickHouse."""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
import httpx
import asyncpg
from workers.clickhouse import insert_metrics
from workers.crypto import decrypt_token

logger = logging.getLogger(__name__)
TIKTOK_ADS_BASE = "https://business-api.tiktok.com/open_api/v1.3"


async def fetch_ad_insights(access_token: str, advertiser_id: str, since: datetime) -> list[dict]:
    headers = {"Access-Token": access_token}
    retries = 0
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(f"{TIKTOK_ADS_BASE}/report/integrated/get/", headers=headers,
                params={"advertiser_id": advertiser_id, "report_type": "BASIC",
                        "data_level": "AUCTION_CAMPAIGN",
                        "dimensions": '["campaign_id","stat_time_day"]',
                        "metrics": '["spend","impressions","clicks","conversion"]',
                        "start_date": since.strftime("%Y-%m-%d"),
                        "end_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "page_size": 1000})
            if resp.status_code == 429:
                await asyncio.sleep(min(2 ** retries, 64)); retries += 1; continue
            resp.raise_for_status()
            return resp.json().get("data", {}).get("list", [])


async def run_sync_ad_insights():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        accounts = await conn.fetch(
            'SELECT id, "organizationId" AS tenant_id, "tiktokAdvertiserId", '
            '"accessTokenEncrypted", "lastSyncedAt", "shopId" '
            'FROM "AdAccount" WHERE "syncStatus" != \'ERROR\''
        )
        for account in accounts:
            since = account["lastSyncedAt"] or (datetime.now(timezone.utc) - timedelta(days=30))
            try:
                rows = await fetch_ad_insights(decrypt_token(account["accessTokenEncrypted"]),
                                               account["tiktokAdvertiserId"], since)
                ch_rows = []
                for row in rows:
                    dims = row.get("dimensions", {}); metrics = row.get("metrics", {})
                    ts = dims.get("stat_time_day", "")
                    if not ts: continue
                    timestamp = datetime.strptime(ts, "%Y-%m-%d").replace(tzinfo=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                    base = {"tenant_id": account["tenant_id"], "shop_id": account["shopId"] or "",
                            "timestamp": timestamp, "dimensions": {"campaign_id": dims.get("campaign_id", "")}}
                    for mname, mkey in [("ad_spend","spend"),("impressions","impressions"),
                                        ("clicks","clicks"),("conversions","conversion")]:
                        ch_rows.append({**base, "metric_name": mname, "value": float(metrics.get(mkey, 0))})
                await insert_metrics(ch_rows)
                await conn.execute('UPDATE "AdAccount" SET "syncStatus"=\'SYNCED\', "lastSyncedAt"=$1 WHERE id=$2',
                                   datetime.now(timezone.utc), account["id"])
            except Exception as e:
                logger.error(f"Error syncing ad account {account['id']}: {e}")
                await conn.execute('UPDATE "AdAccount" SET "syncStatus"=\'ERROR\' WHERE id=$1', account["id"])
    finally:
        await conn.close()
