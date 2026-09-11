import { Injectable } from "@nestjs/common";
import { ClickHouseService } from "../metrics/clickhouse.service";
import { prisma } from "@ecomdash/database";
import { CampaignMetric } from "@ecomdash/shared";

@Injectable()
export class CampaignsService {
  constructor(private readonly ch: ClickHouseService) {}

  async getCampaignPerformance(
    orgId: string,
    adAccountId: string,
    from: Date,
    to: Date
  ): Promise<CampaignMetric[]> {
    // Aggregate ClickHouse metrics by campaign_id
    const rows = await this.ch.query<{
      campaign_id: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      gmv: number;
    }>(
      `SELECT
         dimensions['campaign_id'] AS campaign_id,
         sumIf(value, metric_name = 'ad_spend')    AS spend,
         sumIf(value, metric_name = 'impressions') AS impressions,
         sumIf(value, metric_name = 'clicks')      AS clicks,
         sumIf(value, metric_name = 'conversions') AS conversions,
         sumIf(value, metric_name = 'gmv')         AS gmv
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         AND timestamp >= {from:String}
         AND timestamp <  {to:String}
         AND notEmpty(dimensions['campaign_id'])
       GROUP BY campaign_id
       HAVING spend > 0
       ORDER BY spend DESC
       LIMIT 20
       FORMAT JSONEachRow`,
      {
        orgId,
        from: from.toISOString(),
        to: to.toISOString(),
      }
    );

    if (rows.length === 0) return [];

    // Enrich with campaign names from PostgreSQL
    const campaignIds = rows.map((r) => r.campaign_id);
    const campaigns = await prisma.campaign.findMany({
      where: { tiktokCampaignId: { in: campaignIds } },
      select: { tiktokCampaignId: true, name: true, status: true },
    });
    const campaignMap = new Map(campaigns.map((c) => [c.tiktokCampaignId, c]));

    return rows.map((r) => {
      const c = campaignMap.get(r.campaign_id);
      const ctr = r.impressions > 0 ? Math.round((r.clicks / r.impressions) * 10000) / 100 : 0;
      const roas = r.spend > 0 ? Math.round((r.gmv / r.spend) * 100) / 100 : 0;

      return {
        campaignId: r.campaign_id,
        name: c?.name ?? r.campaign_id,
        status: c?.status ?? "ACTIVE",
        spend: r.spend,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr,
        conversions: r.conversions,
        roas,
      };
    });
  }
}
