import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { ProductsService } from "./products.service";

@Controller("products")
@UseGuards(ClerkGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get("analytics")
  getAnalytics(
    @Query("shopId") shopId: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("sortBy") sortBy?: string,
  ) {
    return this.productsService.getAnalytics(shopId, from, to, sortBy);
  }
}
