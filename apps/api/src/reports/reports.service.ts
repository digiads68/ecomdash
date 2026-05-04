import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";

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

    return prisma.reportConfig.update({ where: { id }, data });
  }

  async remove(id: string, orgId: string) {
    const existing = await prisma.reportConfig.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundException("Report config not found");

    await prisma.reportConfig.delete({ where: { id } });
    return { success: true };
  }
}
