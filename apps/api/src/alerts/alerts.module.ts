import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { AlertCondition, AlertInstanceDto, AlertRuleDto } from "@ecomdash/shared";
import { OrgId } from "../common/decorators";
import { AlertsEvaluator } from "./alerts.evaluator";

interface RuleBody { name: string; shopId?: string | null; conditions: AlertCondition[]; logic?: "AND" | "OR"; actions: AlertRuleDto["actions"]; isActive?: boolean }

@Controller("alerts")
class AlertsController {
  constructor(private readonly evaluator: AlertsEvaluator) {}

  @Get("rules")
  async rules(@OrgId() orgId: string): Promise<AlertRuleDto[]> {
    const rules = await prisma.alertRule.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" }, include: { instances: { where: { state: "FIRING" }, take: 1 } } });
    return rules.map((r) => ({
      id: r.id, shopId: r.shopId, name: r.name, isActive: r.isActive, state: r.instances.length ? "FIRING" : "OK",
      conditions: ((r.conditions as any)?.conditions ?? r.conditions) as AlertCondition[], actions: ((r.actions as any)?.actions ?? r.actions) as AlertRuleDto["actions"],
    }));
  }

  @Post("rules")
  async create(@OrgId() orgId: string, @Body() b: RuleBody) {
    if (!b.name || !b.conditions?.length) throw new BadRequestException("name and conditions are required");
    const r = await prisma.alertRule.create({ data: { organizationId: orgId, shopId: b.shopId ?? null, name: b.name, conditions: { conditions: b.conditions, logic: b.logic ?? "AND" } as any, actions: { actions: b.actions ?? [] } as any, isActive: b.isActive ?? true } });
    return { id: r.id };
  }

  @Put("rules/:id")
  async update(@OrgId() orgId: string, @Param("id") id: string, @Body() b: Partial<RuleBody>) {
    const r = await prisma.alertRule.findFirst({ where: { id, organizationId: orgId } });
    if (!r) throw new NotFoundException();
    await prisma.alertRule.update({
      where: { id },
      data: {
        ...(b.name ? { name: b.name } : {}), ...(b.isActive !== undefined ? { isActive: b.isActive } : {}), ...(b.shopId !== undefined ? { shopId: b.shopId } : {}),
        ...(b.conditions ? { conditions: { conditions: b.conditions, logic: b.logic ?? "AND" } as any } : {}), ...(b.actions ? { actions: { actions: b.actions } as any } : {}),
      },
    });
    return { ok: true };
  }

  @Delete("rules/:id")
  async remove(@OrgId() orgId: string, @Param("id") id: string) {
    const r = await prisma.alertRule.findFirst({ where: { id, organizationId: orgId } });
    if (!r) throw new NotFoundException();
    await prisma.alertRule.delete({ where: { id } });
    return { ok: true };
  }

  @Get("instances")
  async instances(@OrgId() orgId: string, @Query("state") state?: "FIRING" | "RESOLVED"): Promise<AlertInstanceDto[]> {
    const rows = await prisma.alertInstance.findMany({ where: { organizationId: orgId, ...(state ? { state } : {}) }, orderBy: { firedAt: "desc" }, take: 100 });
    return rows.map((i) => ({ id: i.id, ruleId: i.ruleId, kind: i.kind, title: i.title, state: i.state, firedAt: i.firedAt.toISOString(), resolvedAt: i.resolvedAt?.toISOString() ?? null, acknowledgedAt: i.acknowledgedAt?.toISOString() ?? null, detail: (i.metadata as any)?.detail ?? null } as AlertInstanceDto));
  }

  @Post("instances/:id/acknowledge")
  async ack(@OrgId() orgId: string, @Param("id") id: string) {
    const i = await prisma.alertInstance.findFirst({ where: { id, organizationId: orgId } });
    if (!i) throw new NotFoundException();
    await prisma.alertInstance.update({ where: { id }, data: { acknowledgedAt: new Date() } });
    return { ok: true };
  }

  @Post("evaluate")
  evaluate() {
    return this.evaluator.evaluateAll();
  }
}

@Module({ controllers: [AlertsController], providers: [AlertsEvaluator], exports: [AlertsEvaluator] })
export class AlertsModule {}
