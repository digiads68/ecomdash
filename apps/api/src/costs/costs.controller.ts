import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { OrgId } from "../common/decorators";
import { CostItemInput, CostsService, SkuCostInput } from "./costs.service";

@Controller()
export class CostsController {
  constructor(private readonly svc: CostsService) {}

  @Get("costs/skus")
  skus(@OrgId() orgId: string, @Query() q: { shopId: string; missing?: string; q?: string; page?: string; pageSize?: string }) {
    return this.svc.listSkus(orgId, q.shopId, q);
  }

  @Put("costs/skus")
  saveSkus(@OrgId() orgId: string, @Body() body: { shopId: string; items: SkuCostInput[] }) {
    return this.svc.upsertSkuCosts(orgId, body.shopId, body.items);
  }

  @Get("costs/skus/export")
  async export(@OrgId() orgId: string, @Query("shopId") shopId: string, @Query("format") format: "xlsx" | "csv" = "xlsx", @Res() res: Response) {
    const f = await this.svc.exportSkus(orgId, shopId, format === "csv" ? "csv" : "xlsx");
    res.setHeader("Content-Type", f.type);
    res.setHeader("Content-Disposition", `attachment; filename="gia-von-sku.${f.ext}"`);
    res.send(f.body);
  }

  @Post("costs/skus/import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  import(@OrgId() orgId: string, @Query("shopId") shopId: string, @UploadedFile() file: { buffer: Buffer; originalname: string }) {
    return this.svc.importSkus(orgId, shopId, file);
  }

  @Get("costs/items")
  items(@OrgId() orgId: string, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.svc.listItems(orgId, shopId, from, to);
  }

  @Post("costs/items")
  create(@OrgId() orgId: string, @Body() body: CostItemInput & { shopId: string }) {
    return this.svc.createItem(orgId, body.shopId, body);
  }

  @Put("costs/items/:id")
  update(@OrgId() orgId: string, @Param("id") id: string, @Body() body: Partial<CostItemInput>) {
    return this.svc.updateItem(orgId, id, body);
  }

  @Delete("costs/items/:id")
  remove(@OrgId() orgId: string, @Param("id") id: string) {
    return this.svc.deleteItem(orgId, id);
  }

  @Get("shops/:id/config")
  getConfig(@OrgId() orgId: string, @Param("id") id: string) {
    return this.svc.getConfig(orgId, id);
  }

  @Put("shops/:id/config")
  setConfig(@OrgId() orgId: string, @Param("id") id: string, @Body() body: { defaultCogsPercent?: number; restockReturns?: boolean }) {
    return this.svc.setConfig(orgId, id, body);
  }
}
