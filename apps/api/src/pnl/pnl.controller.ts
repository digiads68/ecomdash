import { Controller, Get, Query } from "@nestjs/common";
import { OrgId } from "../common/decorators";
import { PnlService } from "./pnl.service";

@Controller("pnl")
export class PnlController {
  constructor(private readonly svc: PnlService) {}

  @Get("summary")
  summary(@OrgId() orgId: string, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.svc.summary(orgId, shopId, from, to);
  }

  @Get("daily")
  daily(@OrgId() orgId: string, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.svc.daily(orgId, shopId, from, to);
  }

  @Get("products")
  products(@OrgId() orgId: string, @Query("shopId") shopId: string, @Query("from") from?: string, @Query("to") to?: string, @Query("sort") sort?: string) {
    return this.svc.products(orgId, shopId, from, to, sort);
  }

  @Get("orders")
  orders(@OrgId() orgId: string, @Query() q: { shopId: string; from?: string; to?: string; outcome?: string; page?: string; pageSize?: string }) {
    return this.svc.orders(orgId, q.shopId, q);
  }
}
