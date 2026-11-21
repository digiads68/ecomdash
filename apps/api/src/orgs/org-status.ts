import { prisma } from "@ecomdash/database";
import type { OrgLinkStatus } from "@ecomdash/shared";

/** Whether an organisation has finished linking both TikTok platforms (docs/architecture/12 §3.1). */
export async function orgLinkStatus(orgId: string): Promise<OrgLinkStatus> {
  const [org, shops, advertisers, links] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    prisma.shop.count({ where: { organizationId: orgId, isActive: true } }),
    prisma.advertiser.count({ where: { organizationId: orgId, isActive: true } }),
    prisma.advertiserStoreLink.findMany({ where: { advertiser: { organizationId: orgId } }, select: { shopId: true } }),
  ]);
  const shopLinked = shops > 0;
  const adsLinked = advertisers > 0;
  return {
    shopLinked,
    shopCount: shops,
    adsLinked,
    advertiserCount: advertisers,
    adsMode: org.adsMode,
    storeLinksComplete: adsLinked && links.length > 0 && links.every((l) => l.shopId),
    ready: shopLinked && (adsLinked || org.adsMode === "NONE"),
    onboardedAt: org.onboardedAt?.toISOString() ?? null,
  };
}
