import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Post, Put } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { ReportConfigDto } from "@ecomdash/shared";
import { OrgId } from "../common/decorators";
import { PnlModule } from "../pnl/pnl.module";
import { ReportsSender } from "./reports.sender";

type Body_ = Omit<ReportConfigDto, "id" | "shopName" | "lastSentAt">;

@Controller("reports")
class ReportsController {
  @Get("configs")
  async list(@OrgId() orgId: string): Promise<ReportConfigDto[]> {
    const rows = await prisma.reportConfig.findMany({ where: { organizationId: orgId }, include: { shop: true }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ id: r.id, shopId: r.shopId, shopName: r.shop.name, frequency: r.frequency as ReportConfigDto["frequency"], dayOfWeek: r.dayOfWeek, dayOfMonth: r.dayOfMonth, recipientEmail: r.recipientEmail, isActive: r.isActive, lastSentAt: r.lastSentAt?.toISOString() ?? null }));
  }

  @Post("configs")
  async create(@OrgId() orgId: string, @Body() b: Body_) {
    if (!["daily", "weekly", "monthly"].includes(b.frequency) || !b.recipientEmail?.includes("@")) throw new BadRequestException("frequency and recipientEmail are required");
    if (b.frequency === "weekly" && !(b.dayOfWeek! >= 1 && b.dayOfWeek! <= 7)) throw new BadRequestException("dayOfWeek must be 1 (Mon) – 7 (Sun)");
    if (!(await prisma.shop.findFirst({ where: { id: b.shopId, organizationId: orgId } }))) throw new NotFoundException("Shop not found");
    const r = await prisma.reportConfig.create({ data: { organizationId: orgId, shopId: b.shopId, frequency: b.frequency, dayOfWeek: b.dayOfWeek ?? null, dayOfMonth: b.dayOfMonth ?? null, recipientEmail: b.recipientEmail, isActive: b.isActive ?? true } });
    return { id: r.id };
  }

  @Put("configs/:id")
  async update(@OrgId() orgId: string, @Param("id") id: string, @Body() b: Partial<Body_>) {
    if (!(await prisma.reportConfig.findFirst({ where: { id, organizationId: orgId } }))) throw new NotFoundException();
    await prisma.reportConfig.update({ where: { id }, data: { ...(b.frequency ? { frequency: b.frequency } : {}), ...(b.dayOfWeek !== undefined ? { dayOfWeek: b.dayOfWeek } : {}), ...(b.dayOfMonth !== undefined ? { dayOfMonth: b.dayOfMonth } : {}), ...(b.recipientEmail ? { recipientEmail: b.recipientEmail } : {}), ...(b.isActive !== undefined ? { isActive: b.isActive } : {}) } });
    return { ok: true };
  }

  @Delete("configs/:id")
  async remove(@OrgId() orgId: string, @Param("id") id: string) {
    if (!(await prisma.reportConfig.findFirst({ where: { id, organizationId: orgId } }))) throw new NotFoundException();
    await prisma.reportConfig.delete({ where: { id } });
    return { ok: true };
  }
}

@Module({ imports: [PnlModule], controllers: [ReportsController], providers: [ReportsSender], exports: [ReportsSender] })
export class ReportsModule {}
