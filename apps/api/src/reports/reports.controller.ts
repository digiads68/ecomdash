import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Req } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { ReportsService } from "./reports.service";

@Controller("reports/configs")
@UseGuards(ClerkGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get()
  list(@Req() req: any) {
    return this.reportsService.list(req.orgId);
  }

  @Post()
  create(
    @Body() body: {
      shopId: string;
      frequency: string;
      dayOfWeek?: number;
      dayOfMonth?: number;
      recipientEmail: string;
      metrics?: string[];
    },
    @Req() req: any,
  ) {
    return this.reportsService.create(req.orgId, body);
  }

  @Put(":id")
  update(
    @Param("id") id: string,
    @Body() body: Partial<{
      frequency: string;
      dayOfWeek: number;
      dayOfMonth: number;
      recipientEmail: string;
      metrics: string[];
      isActive: boolean;
    }>,
    @Req() req: any,
  ) {
    return this.reportsService.update(id, req.orgId, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: any) {
    return this.reportsService.remove(id, req.orgId);
  }
}
