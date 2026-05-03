import { Controller, Get, Post, Delete, Body, Param, Query, Req } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { CreateAlertRuleDto } from "@ecomdash/shared";

@Controller("alerts")
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get("rules")
  listRules(@Req() req: any) {
    return this.alertsService.listRules(req.orgId);
  }

  @Post("rules")
  createRule(@Req() req: any, @Body() dto: CreateAlertRuleDto) {
    return this.alertsService.createRule(req.orgId, dto);
  }

  @Delete("rules/:id")
  deleteRule(@Req() req: any, @Param("id") id: string) {
    return this.alertsService.deleteRule(req.orgId, id);
  }

  @Get("instances")
  listInstances(@Req() req: any, @Query("limit") limit = "20") {
    return this.alertsService.listInstances(req.orgId, parseInt(limit));
  }

  @Post("instances/:id/acknowledge")
  acknowledge(@Req() req: any, @Param("id") id: string) {
    return this.alertsService.acknowledgeInstance(req.orgId, id);
  }
}
