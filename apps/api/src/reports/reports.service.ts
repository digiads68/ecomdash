import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";

const VALID_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

@Injectable()
export class ReportsService {
  async list(orgId: string) {
    return prisma.reportConfig.findMany({
      where: { organizationId: orgId },
      include: { shop: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(
    orgId: string,
    data: {
      shopId: string;
      frequency: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
      recipientEmail: string;
      metrics?: string[];
    },
  ) {
    await prisma.shop.findFirstOrThrow({ where: { id: data.shopId, organizationId: orgId } });

    if (!VALID_FREQUENCIES.includes(data.frequency as any)) {
      throw new BadRequestException(`frequency must be one of: ${VALID_FREQUENCIES.join(", ")}`);
    }
    if (data.dayOfWeek !== undefined && (data.dayOfWeek < 0 || data.dayOfWeek > 6)) {
      throw new BadRequestException("dayOfWeek must be 0-6");
    }
    if (data.dayOfMonth !== undefined && (data.dayOfMonth < 1 || data.dayOfMonth > 31)) {
      throw new BadRequestException("dayOfMonth must be 1-31");
    }
    if (!data.recipientEmail?.includes("@")) {
      throw new BadRequestException("Invalid recipientEmail");
    }

    return prisma.reportConfig.create({
      data: {
        organizationId: orgId,
        shopId: data.shopId,
        frequency: data.frequency,
        dayOfWeek: data.dayOfWeek ?? null,
        dayOfMonth: data.dayOfMonth ?? null,
        recipientEmail: data.recipientEmail,
        metrics: data.metrics ?? ["gmv", "roas", "ad_spend", "order_count"],
        isActive: true,
      },
    });
  }

  async update(
    id: string,
    orgId: string,
    data: Partial<{
      frequency: string;
      dayOfWeek: number;
      dayOfMonth: number;
      recipientEmail: string;
      metrics: string[];
      isActive: boolean;
    }>,
  ) {
    const existing = await prisma.reportConfig.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException("Report config not found");

    if (data.frequency && !VALID_FREQUENCIES.includes(data.frequency as any)) {
      throw new BadRequestException(`frequency must be one of: ${VALID_FREQUENCIES.join(", ")}`);
    }

    return prisma.reportConfig.update({ where: { id }, data });
  }

  async remove(id: string, orgId: string) {
    const existing = await prisma.reportConfig.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException("Report config not found");

    await prisma.reportConfig.delete({ where: { id } });
    return { success: true };
  }
}
