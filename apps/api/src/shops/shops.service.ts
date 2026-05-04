import { Injectable } from "@nestjs/common";
import { prisma } from "@ecomdash/database";

@Injectable()
export class ShopsService {
  async getConfig(shopId: string, orgId: string) {
    // Verify ownership
    await prisma.shop.findFirstOrThrow({ where: { id: shopId, organizationId: orgId } });

    const config = await prisma.shopConfig.findUnique({ where: { shopId } });
    if (!config) {
      return { shopId, cogsPercent: 40, shippingPercent: 5, platformFeePercent: 2 };
    }
    return config;
  }

  async upsertConfig(
    shopId: string,
    orgId: string,
    data: { cogsPercent?: number; shippingPercent?: number; platformFeePercent?: number },
  ) {
    await prisma.shop.findFirstOrThrow({ where: { id: shopId, organizationId: orgId } });

    return prisma.shopConfig.upsert({
      where: { shopId },
      create: {
        shopId,
        cogsPercent: data.cogsPercent ?? 40,
        shippingPercent: data.shippingPercent ?? 5,
        platformFeePercent: data.platformFeePercent ?? 2,
      },
      update: {
        ...(data.cogsPercent !== undefined && { cogsPercent: data.cogsPercent }),
        ...(data.shippingPercent !== undefined && { shippingPercent: data.shippingPercent }),
        ...(data.platformFeePercent !== undefined && { platformFeePercent: data.platformFeePercent }),
      },
    });
  }
}
