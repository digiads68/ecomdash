import { Test } from "@nestjs/testing";
import { MetricsService } from "./metrics.service";
import { ClickHouseService } from "./clickhouse.service";

const mockQuery = jest.fn();

const mockClickHouse = {
  query: mockQuery,
};

// Mock the database module so tests don't need a real Postgres connection
jest.mock("@ecomdash/database", () => ({
  prisma: {
    product: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

describe("MetricsService", () => {
  let service: MetricsService;

  beforeEach(async () => {
    mockQuery.mockReset();

    const module = await Test.createTestingModule({
      providers: [
        MetricsService,
        { provide: ClickHouseService, useValue: mockClickHouse },
      ],
    }).compile();

    service = module.get(MetricsService);
  });

  describe("getOverview", () => {
    it("returns zero-change overview when both periods have same values", async () => {
      const row = [
        { metric_name: "gmv", value_sum: 1000000 },
        { metric_name: "order_count", value_sum: 10 },
        { metric_name: "ad_spend", value_sum: 200000 },
      ];
      mockQuery.mockResolvedValue(row);

      const from = new Date("2024-01-01");
      const to = new Date("2024-01-31");
      const result = await service.getOverview("org1", "shop1", from, to);

      expect(result.revenue).toBe(1000000);
      expect(result.orders).toBe(10);
      expect(result.adSpend).toBe(200000);
      expect(result.revenueChange).toBe(0);
      expect(result.ordersChange).toBe(0);
      expect(result.roas).toBeCloseTo(5, 1);
      expect(result.roasChange).toBe(0);
    });

    it("calculates positive revenue change correctly", async () => {
      // Current period: 1M revenue; prior period: 500K revenue → +100%
      mockQuery
        .mockResolvedValueOnce([{ metric_name: "gmv", value_sum: 1000000 }])
        .mockResolvedValueOnce([{ metric_name: "gmv", value_sum: 500000 }]);

      const result = await service.getOverview(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-31")
      );

      expect(result.revenue).toBe(1000000);
      expect(result.revenueChange).toBe(100);
    });

    it("returns 0 change when prior period revenue is 0", async () => {
      mockQuery
        .mockResolvedValueOnce([{ metric_name: "gmv", value_sum: 1000000 }])
        .mockResolvedValueOnce([]);

      const result = await service.getOverview(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-31")
      );

      expect(result.revenueChange).toBe(0);
    });

    it("returns 0 ROAS when ad spend is 0", async () => {
      mockQuery.mockResolvedValue([
        { metric_name: "gmv", value_sum: 1000000 },
        { metric_name: "order_count", value_sum: 5 },
      ]);

      const result = await service.getOverview(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-31")
      );

      expect(result.roas).toBe(0);
    });

    it("calls ClickHouse twice — once for current period, once for prior", async () => {
      mockQuery.mockResolvedValue([]);

      await service.getOverview(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-31")
      );

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe("getRevenueTrend", () => {
    it("returns mapped revenue trend points", async () => {
      mockQuery.mockResolvedValue([
        { date: "2024-01-01", revenue: 500000, orders: 5 },
        { date: "2024-01-02", revenue: 750000, orders: 8 },
      ]);

      const result = await service.getRevenueTrend(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-31"),
        "day"
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: "2024-01-01", revenue: 500000, orders: 5 });
      expect(result[1]).toEqual({ date: "2024-01-02", revenue: 750000, orders: 8 });
    });

    it("uses toStartOfHour for hourly granularity", async () => {
      mockQuery.mockResolvedValue([]);

      await service.getRevenueTrend(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-01"),
        "hour"
      );

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("toStartOfHour");
    });

    it("uses toDate for daily granularity", async () => {
      mockQuery.mockResolvedValue([]);

      await service.getRevenueTrend(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-01"),
        "day"
      );

      const sql: string = mockQuery.mock.calls[0][0];
      expect(sql).toContain("toDate");
    });
  });

  describe("getTopProducts", () => {
    it("returns top products enriched with product names", async () => {
      const { prisma } = require("@ecomdash/database");
      prisma.product.findMany.mockResolvedValueOnce([
        { tiktokProductId: "p1", name: "Test Product", thumbnailUrl: "https://example.com/img.jpg" },
      ]);

      mockQuery.mockResolvedValue([
        { product_id: "p1", revenue: 1000000, orders: 10, ad_spend: 0 },
      ]);

      const result = await service.getTopProducts("org1", "shop1", new Date(), new Date(), 5);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Product");
      expect(result[0].thumbnailUrl).toBe("https://example.com/img.jpg");
      expect(result[0].revenue).toBe(1000000);
    });

    it("falls back to product_id as name when not in Postgres", async () => {
      const { prisma } = require("@ecomdash/database");
      prisma.product.findMany.mockResolvedValueOnce([]);

      mockQuery.mockResolvedValue([
        { product_id: "p-unknown", revenue: 500000, orders: 5, ad_spend: 0 },
      ]);

      const result = await service.getTopProducts("org1", "shop1", new Date(), new Date(), 5);

      expect(result[0].name).toBe("p-unknown");
      expect(result[0].roas).toBeNull();
    });
  });

  describe("getShopSummary", () => {
    it("calculates avgOrderValue correctly", async () => {
      mockQuery
        .mockResolvedValueOnce([
          { metric_name: "gmv", value_sum: 2000000 },
          { metric_name: "order_count", value_sum: 4 },
        ])
        .mockResolvedValueOnce([
          { metric_name: "gmv", value_sum: 1000000 },
          { metric_name: "order_count", value_sum: 5 },
        ]);

      const result = await service.getShopSummary(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-31")
      );

      expect(result.avgOrderValue).toBe(500000); // 2M / 4
    });

    it("returns 0 avgOrderValue when no orders", async () => {
      mockQuery.mockResolvedValue([]);

      const result = await service.getShopSummary(
        "org1", "shop1",
        new Date("2024-01-01"), new Date("2024-01-31")
      );

      expect(result.avgOrderValue).toBe(0);
    });
  });
});
