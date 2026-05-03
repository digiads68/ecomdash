"""EcomDash workers entry point.

Starts:
  - BullMQ job processors (sync_shop_orders, sync_ad_insights, evaluate_alerts)
  - APScheduler for periodic 15-min sync triggers
"""
import asyncio
import os
from dotenv import load_dotenv
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from workers.scheduler import schedule_all

load_dotenv()


async def main():
    scheduler = AsyncIOScheduler()
    schedule_all(scheduler)
    scheduler.start()
    print("Workers started. Ctrl+C to stop.")
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
