import { Controller, Get, Query, UseGuards, Req } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { OrdersService } from "./orders.service";

@Controller("orders")
@UseGuards(ClerkGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get("summary")
  summary(
    @Query("shopId") shopId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.ordersService.getSummary(shopId, from, to);
  }

  @Get("trend")
  trend(
    @Query("shopId") shopId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.ordersService.getTrend(shopId, from, to);
  }
}
