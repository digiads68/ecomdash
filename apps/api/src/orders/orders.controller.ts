import { Controller, Get, Query, UseGuards, BadRequestException } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { OrdersService } from "./orders.service";

function validateDateRange(from: string, to: string) {
  const f = new Date(from);
  const t = new Date(to);
  if (isNaN(f.getTime()) || isNaN(t.getTime())) throw new BadRequestException("Invalid date format");
  if (f > t) throw new BadRequestException("from must be before to");
  return { from: f.toISOString(), to: t.toISOString() };
}

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
    if (!shopId) throw new BadRequestException("shopId is required");
    const { from: f, to: t } = validateDateRange(from, to);
    return this.ordersService.getSummary(shopId, f, t);
  }

  @Get("trend")
  trend(
    @Query("shopId") shopId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    if (!shopId) throw new BadRequestException("shopId is required");
    const { from: f, to: t } = validateDateRange(from, to);
    return this.ordersService.getTrend(shopId, f, t);
  }
}
