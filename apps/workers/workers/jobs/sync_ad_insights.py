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
    date_from = since.strftime("%Y-%m-%d")
    date_to = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    async with httpx.AsyncClient() as client:
        retries = 0
        while True:
            resp = await client.get(
                f"{TIKTOK_ADS_BASE}/report/integrated/get/",
                headers=headers,
                params={
                    "advertiser_id": advertiser_id,
                    "report_type": "BASIC",
                    "data_level": "AUCTION_CAMPAIGN",
                    "dimensions": '["campaign_id","stat_time_day"]',
                    "metrics": '["spend","impressions","clicks","conversion","campaign_name"]',
                    "start_date": date_from,
                    "end_date": date_to,
                    "page_size": 1000,
                },
            )
            if resp.status_code == 429:
                wait = 2 ** retries
                await asyncio.sleep(min(wait, 64))
                retries += 1
                continue
            resp.raise_for_status()
            return resp.json().get("data", {}).get("list", [])


async def run_sync_ad_insights():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        accounts = await conn.fetch(
            "SELECT id, organization_id AS tenant_id, tiktok_advertiser_id, "
            "access_token_encrypted, last_synced_at, shop_id "
            "FROM ad_accounts WHERE sync_status != 'ERROR'"
        )

        for account in accounts:
            since = account["last_synced_at"] or (datetime.now(timezone.utc) - timedelta(days=30))
            try:
                token = decrypt_token(account["access_token_encrypted"])
                rows = await fetch_ad_insights(token, account["tiktok_advertiser_id"], since)

                ch_rows = []
                for row in rows:
                    dims = row.get("dimensions", {})
                    metrics = row.get("metrics", {})
                    ts = dims.get("stat_time_day", "")
                    if not ts:
                        continue
                    timestamp = datetime.strptime(ts, "%Y-%m-%d").replace(tzinfo=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
                    campaign_id = dims.get("campaign_id", "")
                    base = {
                        "tenant_id": account["tenant_id"],
                        "shop_id": account["shop_id"] or "",
                        "timestamp": timestamp,
                        "dimensions": {"campaign_id": campaign_id},
                    }
                    for metric_name, metric_key in [
                        ("ad_spend", "spend"),
                        ("impressions", "impressions"),
                        ("clicks", "clicks"),
                        ("conversions", "conversion"),
                    ]:
                        ch_rows.append({**base, "metric_name": metric_name, "value": float(metrics.get(metric_key, 0))})

                await insert_metrics(ch_rows)
                await conn.execute(
                    "UPDATE ad_accounts SET sync_status='SYNCED', last_synced_at=$1 WHERE id=$2",
                    datetime.now(timezone.utc), account["id"],
                )
            except Exception as e:
                logger.error(f"Error syncing ad account {account['id']}: {e}")
                await conn.execute(
                    "UPDATE ad_accounts SET sync_status='ERROR' WHERE id=$1", account["id"]
                )
    finally:
        await conn.close()
