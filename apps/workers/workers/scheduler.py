"""APScheduler job definitions."""
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from workers.jobs.sync_shop_orders import run_sync_shop_orders
from workers.jobs.sync_shop_products import run_sync_shop_products
from workers.jobs.sync_ad_insights import run_sync_ad_insights
from workers.jobs.sync_ad_campaigns import run_sync_ad_campaigns
from workers.jobs.evaluate_alerts import run_evaluate_alerts
from workers.jobs.send_scheduled_reports import run_send_scheduled_reports


def schedule_all(scheduler: AsyncIOScheduler):
    scheduler.add_job(run_sync_shop_orders, "interval", minutes=15, id="sync_shop_orders")
    scheduler.add_job(run_sync_ad_insights, "interval", minutes=15, id="sync_ad_insights")
    scheduler.add_job(run_evaluate_alerts, "interval", minutes=5, id="evaluate_alerts")
    # Entity data synced less frequently — hourly is sufficient
    scheduler.add_job(run_sync_shop_products, "interval", hours=1, id="sync_shop_products")
    scheduler.add_job(run_sync_ad_campaigns, "interval", hours=1, id="sync_ad_campaigns")
    # Scheduled email reports — check daily at 07:00 VN time (00:00 UTC)
    scheduler.add_job(run_send_scheduled_reports, "cron", hour=0, minute=0, id="send_scheduled_reports")
