import { Injectable, BadRequestException } from "@nestjs/common";
import { Response } from "express";
import ExcelJS from "exceljs";
import { ClickHouseService } from "../metrics/clickhouse.service";
import { prisma } from "@ecomdash/database";

@Injectable()
export class ExportService {
  constructor(private readonly clickhouse: ClickHouseService) {}

  async exportData(
    orgId: string,
    type: "orders" | "campaigns",
    format: "csv" | "xlsx",
    from: string,
    to: string,
    shopId: string | undefined,
    adAccountId: string | undefined,
    res: Response
  ) {
    if (type === "orders") {
      await this.exportOrders(orgId, format, from, to, shopId, res);
    } else if (type === "campaigns") {
      await this.exportCampaigns(orgId, format, from, to, adAccountId, res);
    } else {
      throw new BadRequestException("Invalid export type");
    }
  }

  private async exportOrders(
    orgId: string,
    format: "csv" | "xlsx",
    from: string,
    to: string,
    shopId: string | undefined,
    res: Response
  ) {
    // Validate shopId ownership before querying
    if (shopId) {
      await prisma.shop.findFirstOrThrow({ where: { id: shopId, organizationId: orgId } });
    }
    const shopFilter = shopId ? `AND shop_id = {shopId:String}` : "";
    const rows = await this.clickhouse.query<{
      date: string;
      gmv: number;
      order_count: number;
    }>(
      `SELECT
         toDate(timestamp) AS date,
         sumIf(value, metric_name = 'gmv') AS gmv,
         sumIf(value, metric_name = 'order_count') AS order_count
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         ${shopFilter}
         AND timestamp BETWEEN {from:String} AND {to:String}
         AND dimensions['product_id'] = ''
       GROUP BY date
       ORDER BY date ASC
       FORMAT JSONEachRow`,
      { orgId, from, to, ...(shopId ? { shopId } : {}) }
    );

    const headers = ["Ngày", "Doanh thu (VND)", "Số đơn hàng"];
    const data = rows.map((r) => [r.date, r.gmv, r.order_count]);

    await this.writeResponse(res, format, "orders", headers, data);
  }

  private async exportCampaigns(
    orgId: string,
    format: "csv" | "xlsx",
    from: string,
    to: string,
    adAccountId: string | undefined,
    res: Response
  ) {
    // Filter by campaign_id dimension (seed data uses campaign_id, not ad_account_id)
    const campaignFilter = adAccountId
      ? `AND notEmpty(dimensions['campaign_id'])`
      : `AND notEmpty(dimensions['campaign_id'])`;

    const rows = await this.clickhouse.query<{
      campaign_id: string;
      spend: number;
      impressions: number;
      clicks: number;
      conversions: number;
      gmv: number;
    }>(
      `SELECT
         dimensions['campaign_id'] AS campaign_id,
         sumIf(value, metric_name = 'ad_spend') AS spend,
         sumIf(value, metric_name = 'impressions') AS impressions,
         sumIf(value, metric_name = 'clicks') AS clicks,
         sumIf(value, metric_name = 'conversions') AS conversions,
         sumIf(value, metric_name = 'gmv') AS gmv
       FROM ecomdash.metrics_local
       WHERE tenant_id = {orgId:String}
         ${campaignFilter}
         AND timestamp BETWEEN {from:String} AND {to:String}
       GROUP BY campaign_id
       ORDER BY spend DESC
       FORMAT JSONEachRow`,
      { orgId, from, to }
    );

    // Enrich with campaign names from Postgres
    const campaignIds = rows.map((r) => r.campaign_id).filter(Boolean);
    const campaigns = await prisma.campaign.findMany({
      where: { tiktokCampaignId: { in: campaignIds }, adAccount: { organizationId: orgId } },
      select: { tiktokCampaignId: true, name: true },
    });
    const nameMap = Object.fromEntries(campaigns.map((c) => [c.tiktokCampaignId, c.name]));

    const headers = [
      "Chiến dịch",
      "Chi phí (VND)",
      "Lượt hiển thị",
      "Lượt nhấp",
      "Chuyển đổi",
      "Doanh thu (VND)",
      "ROAS",
    ];
    const data = rows.map((r) => [
      nameMap[r.campaign_id] ?? r.campaign_id,
      r.spend,
      r.impressions,
      r.clicks,
      r.conversions,
      r.gmv,
      r.spend > 0 ? +(r.gmv / r.spend).toFixed(2) : 0,
    ]);

    await this.writeResponse(res, format, "campaigns", headers, data);
  }

  private async writeResponse(
    res: Response,
    format: "csv" | "xlsx",
    name: string,
    headers: string[],
    data: (string | number)[][]
  ) {
    const filename = `${name}-${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.csv"`);
      const bom = "﻿"; // UTF-8 BOM for Excel compatibility
      const csvRows = [headers, ...data]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
        )
        .join("\r\n");
      res.end(bom + csvRows);
    } else {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(name);

      sheet.addRow(headers);
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE5EFFF" },
      };

      data.forEach((row) => sheet.addRow(row));

      // Auto-fit columns
      sheet.columns.forEach((col) => {
        let maxLen = 10;
        col.eachCell?.({ includeEmpty: true }, (cell) => {
          maxLen = Math.max(maxLen, String(cell.value ?? "").length + 2);
        });
        col.width = Math.min(maxLen, 40);
      });

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
      await workbook.xlsx.write(res);
      res.end();
    }
  }
}
