import { Controller, Get, Module } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { ShopDto } from "@ecomdash/shared";
import { Acc } from "../common/decorators";
import { Access, canEditShop, viewableShopsWhere } from "../access/access";

/** Shops the signed-in user can view, grouped by client organisation for DigiAds staff (12 §2). */
@Controller("shops")
class ShopsController {
  @Get()
  async list(@Acc() access: Access): Promise<ShopDto[]> {
    const shops = await prisma.shop.findMany({
      where: { AND: [viewableShopsWhere(access), { isActive: true }] },
      include: { organization: { select: { name: true } } },
      orderBy: [{ organization: { name: "asc" } }, { createdAt: "asc" }],
    });
    return shops.map((s) => ({
      id: s.id, name: s.name, code: s.code, region: s.region, currency: s.currency, timezone: s.timezone,
      organizationId: s.organizationId!, organizationName: s.organization?.name ?? "", canEdit: canEditShop(access, s),
    }));
  }
}

@Module({ controllers: [ShopsController] })
export class ShopsModule {}
