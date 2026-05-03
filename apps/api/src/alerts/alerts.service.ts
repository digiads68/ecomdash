import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { CreateAlertRuleDto, AlertInstanceDto } from "@ecomdash/shared";

@Injectable()
export class AlertsService {
  async listRules(orgId: string) {
    return prisma.alertRule.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createRule(orgId: string, dto: CreateAlertRuleDto) {
    return prisma.alertRule.create({
      data: {
        organizationId: orgId,
        shopId: dto.shopId,
        name: dto.name,
        conditions: { conditions: dto.conditions, logic: dto.logic },
        actions: { actions: dto.actions },
        isActive: dto.isActive ?? true,
      },
    });
  }

  async deleteRule(orgId: string, id: string) {
    const rule = await prisma.alertRule.findFirst({ where: { id, organizationId: orgId } });
    if (!rule) throw new NotFoundException("Alert rule not found");
    await prisma.alertRule.delete({ where: { id } });
  }

  async listInstances(orgId: string, limit = 20): Promise<AlertInstanceDto[]> {
    const instances = await prisma.alertInstance.findMany({
      where: { rule: { organizationId: orgId } },
      include: { rule: { select: { name: true } } },
      orderBy: { firedAt: "desc" },
      take: limit,
    });

    return instances.map((i) => ({
      id: i.id,
      ruleId: i.ruleId,
      ruleName: i.rule.name,
      shopId: i.shopId,
      state: i.state as "FIRING" | "RESOLVED",
      metadata: i.metadata as Record<string, unknown>,
      firedAt: i.firedAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
      acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null,
    }));
  }

  async acknowledgeInstance(orgId: string, instanceId: string) {
    const instance = await prisma.alertInstance.findFirst({
      where: { id: instanceId, rule: { organizationId: orgId } },
    });
    if (!instance) throw new NotFoundException("Alert instance not found");

    return prisma.alertInstance.update({
      where: { id: instanceId },
      data: { acknowledgedAt: new Date() },
    });
  }
}
