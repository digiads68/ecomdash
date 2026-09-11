import { Controller, Get, Query, UseGuards, BadRequestException } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { CustomersService } from "./customers.service";

@Controller("customers")
@UseGuards(ClerkGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get("summary")
  summary(
    @Query("shopId") shopId: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    if (!shopId) throw new BadRequestException("shopId is required");
    if (!from || !to) throw new BadRequestException("from and to are required");
    return this.customersService.getSummary(shopId, from, to);
  }

  @Get("top")
  top(
    @Query("shopId") shopId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("limit") limit?: string,
  ) {
    if (!shopId) throw new BadRequestException("shopId is required");
    if (!from || !to) throw new BadRequestException("from and to are required");
    const parsedLimit = Math.min(Math.max(1, parseInt(limit ?? "20") || 20), 100);
    return this.customersService.getTopBuyers(shopId, from, to, parsedLimit);
  }
}
