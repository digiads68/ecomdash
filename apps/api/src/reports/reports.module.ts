import { BadRequestException, Body, Controller, Delete, Get, Module, NotFoundException, Param, Post, Put, Query } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { ReportConfigDto } from "@ecomdash/shared";
import { Acc } from "../common/decorators";
import type { Access } from "../access/access";
import { resolveOrgId } from "../common/util";
import { PnlModule } from "../pnl/pnl.module";
import { ReportsSender } from "./reports.sender";

type Body_ = Omit<ReportConfigDto, "id" | "shopName" | "lastSentAt">;

@Controller("reports")
class ReportsController {
  @Get("configs")
  async list(@Acc() access: Access, @Query("orgId") orgIdQ: string | undefined): Promise<ReportConfigDto[]> {
    const orgId = resolveOrgId(access, orgIdQ, "view");
    const rows = await prisma.reportConfig.findMany({ where: { organizationId: orgId }, include: { shop: true }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ id: r.id, shopId: r.shopId, shopName: r.shop.name, frequency: r.frequency as ReportConfigDto["frequency"], dayOfWeek: r.dayOfWeek, dayOfMonth: r.dayOfMonth, recipientEmail: r.recipientEmail, isActive: r.isActive, lastSentAt: r.lastSentAt?.toISOString() ?? null }));
  }

  @Post("configs")
  async create(@Acc() access: Access, @Query("orgId") orgIdQ: string | undefined, @Body() b: Body_) {
    const orgId = resolveOrgId(access, orgIdQ, "edit");
    if (!["daily", "weekly", "monthly"].includes(b.frequency) || !b.recipientEmail?.includes("@")) throw new BadRequestException("frequency and recipientEmail are required");
    if (b.frequency === "weekly" && !(b.dayOfWeek! >= 1 && b.dayOfWeek! <= 7)) throw new BadRequestException("dayOfWeek must be 1 (Mon) – 7 (Sun)");
    if (!(await prisma.shop.findFirst({ where: { id: b.shopId, organizationId: orgId } }))) throw new NotFoundException("Shop not found");
    const r = await prisma.reportConfig.create({ data: { organizationId: orgId, shopId: b.shopId, frequency: b.frequency, dayOfWeek: b.dayOfWeek ?? null, dayOfMonth: b.dayOfMonth ?? null, recipientEmail: b.recipientEmail, isActive: b.isActive ?? true } });
    return { id: r.id };
  }

  @Put("configs/:id")
  async update(@Acc() access: Access, @Query("orgId") orgIdQ: string | undefined, @Param("id") id: string, @Body() b: Partial<Body_>) {
    const orgId = resolveOrgId(access, orgIdQ, "edit");
    if (!(await prisma.reportConfig.findFirst({ where: { id, organizationId: orgId } }))) throw new NotFoundException();
    await prisma.reportConfig.update({ where: { id }, data: { ...(b.frequency ? { frequency: b.frequency } : {}), ...(b.dayOfWeek !== undefined ? { dayOfWeek: b.dayOfWeek } : {}), ...(b.dayOfMonth !== undefined ? { dayOfMonth: b.dayOfMonth } : {}), ...(b.recipientEmail ? { recipientEmail: b.recipientEmail } : {}), ...(b.isActive !== undefined ? { isActive: b.isActive } : {}) } });
    return { ok: true };
  }

  @Delete("configs/:id")
  async remove(@Acc() access: Access, @Query("orgId") orgIdQ: string | undefined, @Param("id") id: string) {
    const orgId = resolveOrgId(access, orgIdQ, "edit");
    if (!(await prisma.reportConfig.findFirst({ where: { id, organizationId: orgId } }))) throw new NotFoundException();
    await prisma.reportConfig.delete({ where: { id } });
    return { ok: true };
  }
}

@Module({ imports: [PnlModule], controllers: [ReportsController], providers: [ReportsSender], exports: [ReportsSender] })
export class ReportsModule {}
