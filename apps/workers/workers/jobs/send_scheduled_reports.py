"""Send scheduled performance reports via email.

Runs daily. Checks ReportConfig records for due reports and sends via SendGrid.
"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from string import Template
import httpx
import asyncpg

logger = logging.getLogger(__name__)

SENDGRID_API_KEY = os.getenv("SENDGRID_API_KEY", "")
FROM_EMAIL = os.getenv("SENDGRID_FROM_EMAIL", "noreply@ecomdash.vn")
CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "http://localhost:8123")
CLICKHOUSE_DB = os.getenv("CLICKHOUSE_DB", "ecomdash")

EMAIL_TEMPLATE = Template("""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Báo cáo EcomDash</title></head>
<body style="font-family:sans-serif;background:#f9fafb;padding:24px;color:#111827;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#3b82f6;padding:20px 24px;">
      <h1 style="color:#fff;margin:0;font-size:20px;">Ecom<span style="font-weight:900;">Dash</span> — Báo cáo $frequency</h1>
      <p style="color:#bfdbfe;margin:4px 0 0;font-size:13px;">$shop_name · $period</p>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;">Doanh thu (GMV)</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;font-family:monospace;">$gmv</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;">Chi phí quảng cáo</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;font-family:monospace;">$ad_spend</td>
        </tr>
        <tr style="border-bottom:1px solid #f3f4f6;">
          <td style="padding:10px 0;color:#6b7280;">Đơn hàng</td>
          <td style="padding:10px 0;text-align:right;font-weight:600;">$order_count</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#6b7280;">ROAS</td>
          <td style="padding:10px 0;text-align:right;font-weight:700;color:$roas_color;">$roas×</td>
        </tr>
      </table>
      <div style="margin-top:20px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #86efac;">
        <a href="https://ecomdash.vn/overview" style="color:#16a34a;font-size:13px;text-decoration:none;font-weight:600;">
          → Xem chi tiết trên dashboard
        </a>
      </div>
    </div>
    <div style="padding:16px 24px;background:#f9fafb;font-size:12px;color:#9ca3af;text-align:center;">
      EcomDash · Tự động gửi lúc $sent_at · <a href="https://ecomdash.vn/settings" style="color:#9ca3af;">Quản lý báo cáo</a>
    </div>
  </div>
</body>
</html>
""")


def _format_vnd(value: float) -> str:
    return f"{value:,.0f} ₫".replace(",", ".")


async def _query_clickhouse(shop_id: str, tenant_id: str, from_dt: datetime, to_dt: datetime) -> dict:
    """Fetch aggregated metrics from ClickHouse for the period."""
    import json
    sql = """
    SELECT metric_name, sum(value) AS total
    FROM ecomdash.metrics_local
    WHERE tenant_id = {tenantId:String}
      AND shop_id = {shopId:String}
      AND metric_name IN ('gmv','order_count','ad_spend')
      AND timestamp >= {fromTs:String}
      AND timestamp < {toTs:String}
    GROUP BY metric_name
    """
    params = {
        "tenantId": tenant_id,
        "shopId": shop_id,
        "fromTs": from_dt.strftime("%Y-%m-%d %H:%M:%S"),
        "toTs": to_dt.strftime("%Y-%m-%d %H:%M:%S"),
    }
    url_params = {"database": CLICKHOUSE_DB, "default_format": "JSONEachRow"}
    for k, v in params.items():
        url_params[f"param_{k}"] = v
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            CLICKHOUSE_HOST,
            params=url_params,
            content=(sql + " FORMAT JSONEachRow").encode(),
            headers={"Content-Type": "text/plain"},
            timeout=30,
        )
        resp.raise_for_status()
        lines = resp.text.strip().split("\n")
        result = {}
        for line in lines:
            if line:
                row = json.loads(line)
                result[row["metric_name"]] = float(row["total"])
    return result


def _is_due(config: dict, now: datetime) -> bool:
    """Check if the report is due to be sent."""
    last_sent = config["lastSentAt"]
    freq = config["frequency"]

    if freq == "daily":
        if last_sent is None:
            return True
        return (now.date() - last_sent.date()).days >= 1

    if freq == "weekly":
        day_of_week = config.get("dayOfWeek", 1)  # default Monday
        if now.weekday() != day_of_week:
            return False
        if last_sent is None:
            return True
        return (now.date() - last_sent.date()).days >= 7

    if freq == "monthly":
        day_of_month = config.get("dayOfMonth", 1)
        if now.day != day_of_month:
            return False
        if last_sent is None:
            return True
        return (now.date() - last_sent.date()).days >= 28

    return False


async def _send_email(to: str, subject: str, html: str):
    if not SENDGRID_API_KEY or SENDGRID_API_KEY == "SG.xxx":
        logger.info(f"[DEMO] Would send email to {to}: {subject}")
        return
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {SENDGRID_API_KEY}", "Content-Type": "application/json"},
            json={
                "from": {"email": FROM_EMAIL, "name": "EcomDash"},
                "to": [{"email": to}],
                "subject": subject,
                "content": [{"type": "text/html", "value": html}],
            },
        )
        resp.raise_for_status()


async def run_send_scheduled_reports():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    try:
        configs = await conn.fetch(
            """SELECT rc.id, rc."shopId", rc.frequency, rc."dayOfWeek", rc."dayOfMonth",
                      rc."recipientEmail", rc."lastSentAt", s.name AS shop_name,
                      s."organizationId" AS tenant_id
               FROM "ReportConfig" rc
               JOIN "Shop" s ON s.id = rc."shopId"
               WHERE rc."isActive" = true"""
        )

        now = datetime.now(timezone.utc)
        sent_count = 0

        for cfg in configs:
            config = dict(cfg)
            if not _is_due(config, now):
                continue

            freq = config["frequency"]
            if freq == "daily":
                from_dt = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
                to_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
                period = from_dt.strftime("%d/%m/%Y")
                freq_label = "Ngày"
            elif freq == "weekly":
                from_dt = now - timedelta(days=7)
                to_dt = now
                period = f"{from_dt.strftime('%d/%m')} – {to_dt.strftime('%d/%m/%Y')}"
                freq_label = "Tuần"
            else:
                from_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
                from_dt = from_dt.replace(day=1)
                to_dt = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
                period = from_dt.strftime("%m/%Y")
                freq_label = "Tháng"

            try:
                metrics = await _query_clickhouse(config["shopId"], config["tenant_id"], from_dt, to_dt)
                gmv = metrics.get("gmv", 0)
                ad_spend = metrics.get("ad_spend", 0)
                order_count = int(metrics.get("order_count", 0))
                roas = gmv / ad_spend if ad_spend > 0 else 0
                roas_color = "#16a34a" if roas >= 2 else "#dc2626"

                html = EMAIL_TEMPLATE.substitute(
                    frequency=freq_label,
                    shop_name=config["shop_name"],
                    period=period,
                    gmv=_format_vnd(gmv),
                    ad_spend=_format_vnd(ad_spend),
                    order_count=f"{order_count:,}".replace(",", "."),
                    roas=f"{roas:.2f}",
                    roas_color=roas_color,
                    sent_at=now.strftime("%H:%M %d/%m/%Y"),
                )

                subject = f"[EcomDash] Báo cáo {freq_label} — {config['shop_name']} · {period}"
                await _send_email(config["recipientEmail"], subject, html)

                await conn.execute(
                    'UPDATE "ReportConfig" SET "lastSentAt"=$1 WHERE id=$2',
                    now, config["id"],
                )
                sent_count += 1
                logger.info(f"Sent {freq_label} report to {config['recipient_email']} for shop {config['shop_id']}")
            except Exception as e:
                logger.error(f"Failed to send report for config {config['id']}: {e}")

        logger.info(f"Scheduled reports: sent {sent_count}/{len(configs)} due reports")
    finally:
        await conn.close()
