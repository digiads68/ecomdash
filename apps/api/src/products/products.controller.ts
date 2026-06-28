import { Controller, Get, Query, UseGuards, BadRequestException } from "@nestjs/common";
import { ClerkGuard } from "../auth/clerk.guard";
import { ProductsService } from "./products.service";

const VALID_SORT = ["revenue", "orders", "roas"] as const;
type SortBy = typeof VALID_SORT[number];

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
    if (!shopId) throw new BadRequestException("shopId is required");
    if (!from || !to) throw new BadRequestException("from and to are required");
    const f = new Date(from);
    const t = new Date(to);
    if (isNaN(f.getTime()) || isNaN(t.getTime())) throw new BadRequestException("Invalid date format");
    if (f > t) throw new BadRequestException("from must be before to");
    const sort: SortBy = VALID_SORT.includes(sortBy as SortBy) ? (sortBy as SortBy) : "revenue";
    return this.productsService.getAnalytics(shopId, from, to, sort);
  }
}
