import { Injectable, BadRequestException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";

function validatePercent(name: string, value: number | undefined) {
  if (value === undefined) return;
  if (typeof value !== "number" || isNaN(value) || value < 0 || value > 100) {
    throw new BadRequestException(`${name} must be a number between 0 and 100`);
  }
}

@Injectable()
export class ShopsService {
  async getConfig(shopId: string, orgId: string) {
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

    validatePercent("cogsPercent", data.cogsPercent);
    validatePercent("shippingPercent", data.shippingPercent);
    validatePercent("platformFeePercent", data.platformFeePercent);

    const total = (data.cogsPercent ?? 0) + (data.shippingPercent ?? 0) + (data.platformFeePercent ?? 0);
    if (total > 100) throw new BadRequestException("Total cost percentages cannot exceed 100%");

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
