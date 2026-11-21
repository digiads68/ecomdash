import { Controller, Get, Query } from "@nestjs/common";
import type { Access } from "../access/access";
import { Acc } from "../common/decorators";
import { PnlService } from "./pnl.service";

@Controller("pnl")
export class PnlController {
  constructor(private readonly svc: PnlService) {}

  @Get("summary")
  summary(@Acc() access: Access, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.svc.summary(access, shopId, from, to);
  }

  @Get("daily")
  daily(@Acc() access: Access, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.svc.daily(access, shopId, from, to);
  }

  @Get("products")
  products(@Acc() access: Access, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string, @Query("sort") sort?: string) {
    return this.svc.products(access, shopId, from, to, sort);
  }

  @Get("orders")
  orders(@Acc() access: Access, @Query() q: { shopId: string; from?: string; to?: string; outcome?: string; page?: string; pageSize?: string }) {
    return this.svc.orders(access, q.shopId, q);
  }
}
