import { Controller, Get, Module } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { ShopDto } from "@ecomdash/shared";
import { OrgId } from "../common/decorators";

@Controller("shops")
class ShopsController {
  @Get()
  async list(@OrgId() orgId: string): Promise<ShopDto[]> {
    const shops = await prisma.shop.findMany({ where: { organizationId: orgId, isActive: true }, orderBy: { createdAt: "asc" } });
    return shops.map((s) => ({ id: s.id, name: s.name, code: s.code, region: s.region, currency: s.currency, timezone: s.timezone }));
  }
}

@Module({ controllers: [ShopsController] })
export class ShopsModule {}
