"""Route alert notifications to email or Telegram."""
import logging
import os
import httpx

logger = logging.getLogger(__name__)


async def dispatch_notification(actions: list[dict], rule_name: str, current_values: dict):
    for action in actions:
        action_type = action.get("type")
        if action_type == "email":
            await send_email(action.get("to", ""), rule_name, current_values)
        elif action_type == "telegram":
            await send_telegram(action.get("chatId", ""), rule_name, current_values)


async def send_email(to: str, rule_name: str, values: dict):
    api_key = os.getenv("SENDGRID_API_KEY", "")
    from_email = os.getenv("SENDGRID_FROM_EMAIL", "noreply@ecomdash.vn")
    if not api_key:
        logger.warning("SENDGRID_API_KEY not set, skipping email")
        return

    metrics_text = "\n".join(f"  - {k}: {v:.2f}" for k, v in values.items())
    body = f"<h2>🔴 Cảnh báo: {rule_name}</h2><pre>{metrics_text}</pre>"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "personalizations": [{"to": [{"email": to}]}],
                "from": {"email": from_email, "name": "EcomDash"},
                "subject": f"[EcomDash] Cảnh báo: {rule_name}",
                "content": [{"type": "text/html", "value": body}],
            },
        )
        if resp.status_code not in (200, 202):
            logger.error(f"SendGrid error {resp.status_code}: {resp.text}")


async def send_telegram(chat_id: str, rule_name: str, values: dict):
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN not set, skipping Telegram")
        return

    metrics_text = "\n".join(f"  • {k}: `{v:.2f}`" for k, v in values.items())
    text = f"🔴 *Cảnh báo EcomDash*\n*{rule_name}*\n\n{metrics_text}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "Markdown"},
        )
        if not resp.json().get("ok"):
            logger.error(f"Telegram error: {resp.text}")
