import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import { Response } from "express";
import { ExportService } from "./export.service";

@Controller("export")
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  async exportData(
    @Req() req: any,
    @Res() res: Response,
    @Query("type") type: "orders" | "campaigns" = "orders",
    @Query("format") format: "csv" | "xlsx" = "csv",
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("shopId") shopId?: string,
    @Query("adAccountId") adAccountId?: string
  ) {
    await this.exportService.exportData(
      req.orgId,
      type,
      format,
      from ?? new Date(Date.now() - 30 * 86400_000).toISOString(),
      to ?? new Date().toISOString(),
      shopId,
      adAccountId,
      res
    );
  }
}
