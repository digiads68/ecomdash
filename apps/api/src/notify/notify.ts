import { Logger } from "@nestjs/common";
import { config } from "../config";

const logger = new Logger("Notify");

export type Action = { type: "email"; to: string } | { type: "telegram"; chatId: string };

/** SendGrid / Telegram when keys are configured; otherwise (demo) the message is only logged. */
export async function notify(actions: Action[], subject: string, text: string) {
  for (const a of actions) {
    try {
      if (a.type === "email") {
        if (!config().SENDGRID_API_KEY) { logger.log(`[demo] email → ${a.to}: ${subject}`); continue; }
        await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${config().SENDGRID_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ personalizations: [{ to: [{ email: a.to }] }], from: { email: config().SENDGRID_FROM_EMAIL, name: "EcomDash" }, subject, content: [{ type: "text/plain", value: text }] }),
        });
      } else if (a.type === "telegram") {
        if (!config().TELEGRAM_BOT_TOKEN) { logger.log(`[demo] telegram → ${a.chatId}: ${subject}`); continue; }
        await fetch(`https://api.telegram.org/bot${config().TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: a.chatId, text: `${subject}\n${text}` }),
        });
      }
    } catch (e) {
      logger.warn(`notify ${a.type} failed: ${(e as Error).message}`);
    }
  }
}
