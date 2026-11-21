import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import type { Access } from "../access/access";
import { Acc } from "../common/decorators";
import { CostItemInput, CostsService, SkuCostInput } from "./costs.service";

@Controller()
export class CostsController {
  constructor(private readonly svc: CostsService) {}

  @Get("costs/skus")
  skus(@Acc() access: Access, @Query() q: { shopId: string; missing?: string; q?: string; page?: string; pageSize?: string }) {
    return this.svc.listSkus(access, q.shopId, q);
  }

  @Put("costs/skus")
  saveSkus(@Acc() access: Access, @Body() body: { shopId: string; items: SkuCostInput[] }) {
    return this.svc.upsertSkuCosts(access, body.shopId, body.items);
  }

  @Get("costs/skus/export")
  async export(@Acc() access: Access, @Query("shopId") shopId: string, @Query("format") format: "xlsx" | "csv" = "xlsx", @Res() res: Response) {
    const f = await this.svc.exportSkus(access, shopId, format === "csv" ? "csv" : "xlsx");
    res.setHeader("Content-Type", f.type);
    res.setHeader("Content-Disposition", `attachment; filename="gia-von-sku.${f.ext}"`);
    res.send(f.body);
  }

  @Post("costs/skus/import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024 } }))
  import(@Acc() access: Access, @Query("shopId") shopId: string, @UploadedFile() file: { buffer: Buffer; originalname: string }) {
    return this.svc.importSkus(access, shopId, file);
  }

  @Get("costs/items")
  items(@Acc() access: Access, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.svc.listItems(access, shopId, from, to);
  }

  @Post("costs/items")
  create(@Acc() access: Access, @Body() body: CostItemInput & { shopId: string }) {
    return this.svc.createItem(access, body.shopId, body);
  }

  @Put("costs/items/:id")
  update(@Acc() access: Access, @Param("id") id: string, @Body() body: Partial<CostItemInput>) {
    return this.svc.updateItem(access, id, body);
  }

  @Delete("costs/items/:id")
  remove(@Acc() access: Access, @Param("id") id: string) {
    return this.svc.deleteItem(access, id);
  }

  @Get("shops/:id/config")
  getConfig(@Acc() access: Access, @Param("id") id: string) {
    return this.svc.getConfig(access, id);
  }

  @Put("shops/:id/config")
  setConfig(@Acc() access: Access, @Param("id") id: string, @Body() body: { defaultCogsPercent?: number; restockReturns?: boolean }) {
    return this.svc.setConfig(access, id, body);
  }
}
