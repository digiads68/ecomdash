import { Controller, Get, Put, Param, Body, UseGuards, Req } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { ShopsService } from "./shops.service";

@Controller("shops")
@UseGuards(ClerkGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get(":id/config")
  getConfig(@Param("id") id: string, @Req() req: any) {
    return this.shopsService.getConfig(id, req.orgId);
  }

  @Put(":id/config")
  upsertConfig(
    @Param("id") id: string,
    @Body() body: { cogsPercent?: number; shippingPercent?: number; platformFeePercent?: number },
    @Req() req: any,
  ) {
    return this.shopsService.upsertConfig(id, req.orgId, body);
  }
}
