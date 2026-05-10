import { Controller, Get, Query, UseGuards } from "@nestjs/common";
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
    return this.customersService.getSummary(shopId, from, to);
  }

  @Get("top")
  top(
    @Query("shopId") shopId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("limit") limit?: string,
  ) {
    return this.customersService.getTopBuyers(shopId, from, to, limit ? parseInt(limit) : 20);
  }
}
