import { Injectable } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { addDays, dateOnly, toBusinessDate } from "@ecomdash/shared";
import { config } from "../config";
import { adsClientFor } from "../tiktok/clients";
import { AdStatInput, mapGmvMaxRow, mapIntegratedRow } from "./mappers";
import { QueueService } from "./queue.service";
import { SyncStateService } from "./sync-state.service";

@Injectable()
export class AdsSyncService {
  constructor(private readonly state: SyncStateService, private readonly queue: QueueService) {}

  private async adv(advertiserId: string) {
    return prisma.advertiser.findUniqueOrThrow({ where: { id: advertiserId } });
  }

  async backfill(advertiserId: string) {
    await this.entities(advertiserId);
    await this.reports(advertiserId, config().BACKFILL_DAYS + 1);
  }

  /** advertiser info, campaigns, store links (02 §3). */
  async entities(advertiserId: string) {
    const adv = await this.adv(advertiserId);
    await this.state.run({ organizationId: adv.organizationId, scopeType: "ADVERTISER", scopeId: adv.id, resource: "ads_entities" }, async () => {
      const { client, tiktokAdvertiserId } = await adsClientFor(advertiserId);
      const [info] = await client.getAdvertiserInfo([tiktokAdvertiserId]);
      if (info) {
        await prisma.advertiser.update({ where: { id: adv.id }, data: { name: info.name, currency: info.currency, timezone: info.timezone, ownerBcId: info.owner_bc_id ?? null } });
      }
      const campaigns = await client.listCampaigns(tiktokAdvertiserId);
      for (const c of campaigns) {
        const isGmvMax = c.campaign_type === "GMV_MAX" || !!c.is_gmv_max;
        let roasBid: number | null = null;
        let storeId: string | null = null;
        if (isGmvMax) {
          const g = await client.getGmvMaxCampaign(tiktokAdvertiserId, c.campaign_id).catch(() => null);
          roasBid = g?.roas_bid ?? null;
          storeId = g?.store_id ?? null;
        }
        const data = {
          name: c.campaign_name, kind: isGmvMax ? ("GMV_MAX" as const) : ("MANUAL" as const), objectiveType: c.objective_type,
          operationStatus: c.operation_status, budgetMode: c.budget_mode, budget: c.budget ?? null, roasBid, storeId,
        };
        await prisma.campaign.upsert({
          where: { advertiserId_tiktokCampaignId: { advertiserId: adv.id, tiktokCampaignId: c.campaign_id } },
          create: { advertiserId: adv.id, tiktokCampaignId: c.campaign_id, ...data },
          update: data,
        });
      }
      const stores = await client.getGmvMaxStores(tiktokAdvertiserId);
      const shops = await prisma.shop.findMany({ where: { organizationId: adv.organizationId } });
      for (const s of stores) {
        const existing = await prisma.advertiserStoreLink.findUnique({ where: { advertiserId_storeId: { advertiserId: adv.id, storeId: s.store_id } } });
        let shopId = existing?.matchedBy === "MANUAL" ? existing.shopId : null;
        let matchedBy = existing?.matchedBy === "MANUAL" ? "MANUAL" : null;
        if (!matchedBy) {
          const byId = shops.find((x) => x.tiktokShopId === s.store_id);
          const byCode = !byId && s.store_code ? shops.find((x) => x.code === s.store_code) : undefined;
          shopId = (byId ?? byCode)?.id ?? null;
          matchedBy = byId ? "STORE_ID" : byCode ? "STORE_CODE" : null;
        }
        const data = { storeCode: s.store_code ?? null, storeName: s.store_name, storeAuthorizedBcId: s.store_authorized_bc_id ?? null, shopId, matchedBy, isGmvMaxAvailable: !!s.is_gmv_max_available };
        await prisma.advertiserStoreLink.upsert({ where: { advertiserId_storeId: { advertiserId: adv.id, storeId: s.store_id } }, create: { advertiserId: adv.id, storeId: s.store_id, ...data }, update: data });
      }
      return { items: campaigns.length + stores.length };
    });
  }

  /** Two sources kept apart; always re-pull the trailing window because attribution restates (02 §4, 04 §5). */
  async reports(advertiserId: string, days = 7) {
    const adv = await this.adv(advertiserId);
    await this.state.run({ organizationId: adv.organizationId, scopeType: "ADVERTISER", scopeId: adv.id, resource: "ads_reports" }, async () => {
      const { client, tiktokAdvertiserId } = await adsClientFor(advertiserId);
      const end = toBusinessDate(new Date(), adv.timezone);
      const start = addDays(end, -(days - 1));
      const manual = (await client.integratedReport({ advertiserId: tiktokAdvertiserId, startDate: start, endDate: end })).map(mapIntegratedRow);
      let items = await this.upsertStats(adv.id, manual, "INTEGRATED", null);
      const links = await prisma.advertiserStoreLink.findMany({ where: { advertiserId: adv.id, isGmvMaxAvailable: true } });
      for (const l of links) {
        const rows = (await client.gmvMaxReport({ advertiserId: tiktokAdvertiserId, storeId: l.storeId, startDate: start, endDate: end })).map(mapGmvMaxRow);
        items += await this.upsertStats(adv.id, rows, "GMV_MAX", l.storeId);
      }
      const shopIds = (await prisma.advertiserStoreLink.findMany({ where: { advertiserId: adv.id, shopId: { not: null } }, select: { shopId: true } })).map((x) => x.shopId!);
      for (const shopId of new Set(shopIds)) await this.queue.requestPnlRecompute(shopId, start);
      return { items };
    });
  }

  private async upsertStats(advertiserId: string, rows: AdStatInput[], source: "INTEGRATED" | "GMV_MAX", storeId: string | null) {
    const campaigns = await prisma.campaign.findMany({ where: { advertiserId }, select: { id: true, tiktokCampaignId: true } });
    const byTk = new Map(campaigns.map((c) => [c.tiktokCampaignId, c.id]));
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        let campaignId = byTk.get(r.campaignTiktokId);
        if (!campaignId) {
          const c = await tx.campaign.create({
            data: { advertiserId, tiktokCampaignId: r.campaignTiktokId, name: r.campaignTiktokId, kind: source === "GMV_MAX" ? "GMV_MAX" : "MANUAL", operationStatus: "ENABLE", storeId },
          });
          campaignId = c.id;
          byTk.set(r.campaignTiktokId, c.id);
        }
        const date = dateOnly(r.date);
        const data = { spend: r.spend, impressions: r.impressions, clicks: r.clicks, conversions: r.conversions, orders: r.orders, grossRevenue: r.grossRevenue, storeId, syncedAt: new Date() };
        await tx.adDailyStat.upsert({
          where: { campaignId_date_source: { campaignId, date, source } },
          create: { advertiserId, campaignId, date, source, ...data },
          update: data,
        });
      }
    }, { timeout: 60_000 });
    return rows.length;
  }
}
