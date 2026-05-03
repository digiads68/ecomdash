import { Controller, Get, Query, Req } from "@nestjs/common";
import { CampaignsService } from "./campaigns.service";

function parseDate(val: string | undefined, fallback: Date): Date {
  if (!val) return fallback;
  const d = new Date(val);
  return isNaN(d.getTime()) ? fallback : d;
}

@Controller("campaigns")
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  async getCampaigns(
    @Req() req: any,
    @Query("adAccountId") adAccountId: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    const now = new Date();
    const toDate = parseDate(to, now);
    const fromDate = parseDate(from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

    return this.campaignsService.getCampaignPerformance(
      req.orgId,
      adAccountId,
      fromDate,
      toDate
    );
  }
}
