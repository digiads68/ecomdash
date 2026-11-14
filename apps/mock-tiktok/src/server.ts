import { signWebhook } from "@ecomdash/tiktok-client";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { orderStatus, returnState, World, buildWorld } from "./world";

function startWebhookSender(world: World, appKey: string, appSecret: string, url: string, intervalSec: number) {
  let last = world.now();
  const timer = setInterval(async () => {
    const now = world.now();
    const events: { body: string }[] = [];
    for (const o of world.orders) {
      if (o.createTime > now) break;
      const shopId = world.shops[o.shopIdx].id;
      for (const [t] of o.events) {
        if (t > last && t <= now) {
          const st = orderStatus(o, t);
          const status = st.status === "CANCELLED" ? "CANCEL" : st.status;
          events.push({ body: JSON.stringify({ type: 1, tts_notification_id: `${o.id}-${t}`, shop_id: shopId, timestamp: t, data: { order_id: o.id, order_status: status, is_on_hold_order: false, update_time: t } }) });
        }
      }
      if (o.ret) for (const [, t] of o.ret.timeline) {
        if (t > last && t <= now) {
          const rs = returnState(o.ret, t)!;
          events.push({ body: JSON.stringify({ type: 12, tts_notification_id: `${o.ret.id}-${t}`, shop_id: shopId, timestamp: t, data: { order_id: o.id, return_id: o.ret.id, return_status: rs.status, update_time: t } }) });
        }
      }
    }
    last = now;
    for (const e of events.slice(0, 2000)) {
      const send = () => fetch(url, { method: "POST", headers: { "content-type": "application/json", Authorization: signWebhook(appKey, appSecret, e.body) }, body: e.body }).catch(() => undefined);
      await send();
      if (Math.random() < 0.05) await send(); // TikTok may deliver the same notification twice
    }
  }, intervalSec * 1000);
  timer.unref();
}

async function main() {
  const cfg = loadConfig();
  const t0 = Date.now();
  const world = buildWorld(cfg);
  const { app } = buildApp(world);
  await app.listen({ port: cfg.port, host: "0.0.0.0" });
  const visible = world.orders.filter((o) => o.createTime <= world.now()).length;
  console.log(`[mock-tiktok] listening on :${cfg.port} — ${world.shops.length} shops, ${visible} orders so far (${world.orders.length} incl. scheduled), built in ${Date.now() - t0}ms`);
  if (cfg.webhookUrl) {
    startWebhookSender(world, cfg.appKey, cfg.appSecret, cfg.webhookUrl, cfg.webhookIntervalSec);
    console.log(`[mock-tiktok] sending webhooks to ${cfg.webhookUrl} every ${cfg.webhookIntervalSec}s`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
