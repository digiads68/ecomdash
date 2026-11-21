import { Controller, HttpCode, Logger, Post, RawBodyRequest, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { prisma } from "@ecomdash/database";
import { verifyWebhookSignature, WebhookEnvelope } from "@ecomdash/tiktok-client";
import { config } from "../config";
import { Public } from "../common/decorators";
import { QueueService } from "../sync/queue.service";

/** 01 §11 / 04 §9 — verify, dedupe on tts_notification_id, enqueue targeted sync, answer within 3s. */
@Controller("webhooks")
export class WebhooksController {
  private readonly logger = new Logger("Webhook");
  constructor(private readonly queue: QueueService) {}

  @Public()
  @Post("tiktok")
  @HttpCode(200)
  async tiktok(@Req() req: RawBodyRequest<any>, @Res() res: Response) {
    const raw = req.rawBody?.toString("utf8") ?? "";
    if (!verifyWebhookSignature(config().TIKTOK_APP_KEY, config().TIKTOK_APP_SECRET, raw, req.headers["authorization"] as string | undefined)) {
      return res.status(401).json({ ok: false });
    }
    let env: WebhookEnvelope<any>;
    try { env = JSON.parse(raw); } catch { return res.status(400).json({ ok: false }); }
    const inserted = await prisma.webhookEvent.createMany({
      data: [{ ttsNotificationId: env.tts_notification_id, type: env.type, tiktokShopId: env.shop_id ?? null, payload: env as any }],
      skipDuplicates: true,
    });
    if (!inserted.count) return res.json({ ok: true, duplicate: true });

    const shops = env.shop_id ? await prisma.shop.findMany({ where: { tiktokShopId: env.shop_id, isActive: true }, include: { sellerAuthorization: true } }) : [];
    for (const shop of shops) {
      switch (env.type) {
        case 1:
        case 4:
          if (env.data?.order_id) await this.queue.enqueue("shop.orders.ids", { shopId: shop.id, ids: [env.data.order_id] }, { jobId: `ids:${env.tts_notification_id}:${shop.id}`, removeOnComplete: true });
          break;
        case 5:
        case 15:
        case 16:
          await this.queue.enqueue("shop.products", { shopId: shop.id }, { delay: 10_000 });
          break;
        case 11:
        case 12:
          await this.queue.enqueue("shop.returns", { shopId: shop.id }, { delay: 10_000 });
          break;
        case 6:
          await prisma.sellerAuthorization.update({ where: { id: shop.sellerAuthorizationId }, data: { status: "REVOKED" } });
          break;
        case 7:
          if (env.data?.expiration_time) {
            await prisma.sellerAuthorization.update({ where: { id: shop.sellerAuthorizationId }, data: { refreshExpiresAt: new Date(env.data.expiration_time * 1000) } });
          }
          if (shop.organizationId) await prisma.alertInstance.create({
            data: { organizationId: shop.organizationId, shopId: shop.id, kind: "AUTH_EXPIRING", title: `Uỷ quyền TikTok Shop "${shop.sellerAuthorization.sellerName}" sắp hết hạn`, state: "FIRING", metadata: env.data ?? {} },
          });
          break;
      }
    }
    await prisma.webhookEvent.update({ where: { ttsNotificationId: env.tts_notification_id }, data: { processedAt: new Date() } });
    return res.json({ ok: true });
  }
}
