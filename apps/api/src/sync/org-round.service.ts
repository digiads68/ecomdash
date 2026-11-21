import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { AdsSyncService } from "./ads-sync.service";
import { ShopSyncService } from "./shop-sync.service";

/**
 * One synchronisation round of an organisation (12 §4): orders and returns of every shop, then the ad reports of
 * every advertiser, back to back. The finished round is the common watermark the dashboard shows.
 */
@Injectable()
export class OrgRoundService {
  private readonly logger = new Logger("Round");
  constructor(private readonly shops: ShopSyncService, private readonly ads: AdsSyncService) {}

  private async ok(scopeType: string, scopeId: string, resource: string) {
    const s = await prisma.syncState.findUnique({ where: { scopeType_scopeId_resource: { scopeType, scopeId, resource } } });
    return s?.status === "OK";
  }

  async run(orgId: string) {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) return null;
    const [shops, advertisers] = await Promise.all([
      prisma.shop.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true } }),
      prisma.advertiser.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true } }),
    ]);
    if (!shops.length && !advertisers.length) return null;
    const round = await prisma.syncRound.create({ data: { organizationId: orgId } });
    const errors: string[] = [];

    let shopOk = shops.length > 0;
    for (const s of shops) {
      try {
        await this.shops.orders(s.id);
        await this.shops.returns(s.id);
      } catch (e) {
        errors.push((e as Error).message);
      }
      shopOk &&= (await this.ok("SHOP", s.id, "orders")) && (await this.ok("SHOP", s.id, "returns"));
    }
    const shopSyncedTo = new Date();

    let adsOk = org.adsMode === "NONE" || advertisers.length > 0;
    for (const a of advertisers) {
      try {
        await this.ads.reports(a.id, 7);
      } catch (e) {
        errors.push((e as Error).message);
      }
      adsOk &&= await this.ok("ADVERTISER", a.id, "ads_reports");
    }
    const adsSyncedTo = new Date();

    await prisma.syncRound.update({
      where: { id: round.id },
      data: { finishedAt: new Date(), shopOk, adsOk, shopSyncedTo: shopOk ? shopSyncedTo : null, adsSyncedTo: adsOk && advertisers.length ? adsSyncedTo : null, error: errors.join(" | ").slice(0, 500) || null },
    });
    this.logger.log(`org=${orgId} shops=${shops.length} advertisers=${advertisers.length} shopOk=${shopOk} adsOk=${adsOk}`);
    return { shopOk, adsOk };
  }
}
