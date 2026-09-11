import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { AdsService } from "./ads.service";

@Controller("ads")
@UseGuards(ClerkGuard)
export class AdsController {
  constructor(private readonly adsService: AdsService) {}

  @Get("budget-forecast")
  budgetForecast(
    @Query("adAccountId") adAccountId: string,
    @Query("month") month: string,
    @Req() req: any,
  ) {
    return this.adsService.getBudgetForecast(adAccountId, month, req.orgId);
  }
}
