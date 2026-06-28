import { Test } from "@nestjs/testing";
import { AdsService } from "./ads.service";
import { ClickHouseService } from "../metrics/clickhouse.service";
import { NotFoundException } from "@nestjs/common";

const mockQuery = jest.fn();

jest.mock("@ecomdash/database", () => ({
  prisma: {
    adAccount: {
      findFirst: jest.fn(),
    },
  },
}));

describe("AdsService", () => {
  let service: AdsService;

  beforeEach(async () => {
    const { prisma } = require("@ecomdash/database");
    mockQuery.mockReset();
    jest.mocked(prisma.adAccount.findFirst).mockReset();

    const module = await Test.createTestingModule({
      providers: [
        AdsService,
        { provide: ClickHouseService, useValue: { query: mockQuery } },
      ],
    }).compile();

    service = module.get(AdsService);
  });

  describe("_linearForecast (via getBudgetForecast)", () => {
    beforeEach(() => {
      const { prisma } = require("@ecomdash/database");
      jest.mocked(prisma.adAccount.findFirst).mockResolvedValue({ shopId: "shop1" });
    });

    it("returns 0 when no spend data", async () => {
      mockQuery.mockResolvedValue([]);

      const result = await service.getBudgetForecast("acc1", "2024-01", "org1");

      expect(result.projectedSpend).toBe(0);
      expect(result.currentSpend).toBe(0);
    });

    it("projects linearly from single day spend", async () => {
      mockQuery.mockResolvedValue([{ date: "2024-01-01", spend: 100 }]);

      const result = await service.getBudgetForecast("acc1", "2024-01", "org1");

      // Single data point: projectedSpend = 100 * 31 days
      expect(result.projectedSpend).toBe(3100);
    });

    it("returns currentSpend as sum of all daily spend", async () => {
      mockQuery.mockResolvedValue([
        { date: "2024-01-01", spend: 200 },
        { date: "2024-01-02", spend: 300 },
        { date: "2024-01-03", spend: 150 },
      ]);

      const result = await service.getBudgetForecast("acc1", "2024-01", "org1");

      expect(result.currentSpend).toBe(650);
    });

    it("projects based on linear trend for multiple days", async () => {
      // Consistent 100/day spend for 5 days
      mockQuery.mockResolvedValue([
        { date: "2024-01-01", spend: 100 },
        { date: "2024-01-02", spend: 100 },
        { date: "2024-01-03", spend: 100 },
        { date: "2024-01-04", spend: 100 },
        { date: "2024-01-05", spend: 100 },
      ]);

      const result = await service.getBudgetForecast("acc1", "2024-01", "org1");

      expect(result.currentSpend).toBe(500);
      expect(result.projectedSpend).toBeGreaterThanOrEqual(500);
    });

    it("reports correct daysElapsed and daysInMonth for January", async () => {
      mockQuery.mockResolvedValue([]);

      const result = await service.getBudgetForecast("acc1", "2024-01", "org1");

      expect(result.daysInMonth).toBe(31);
      expect(result.daysElapsed).toBeGreaterThan(0);
    });
  });

  describe("getBudgetForecast — ad account resolution", () => {
    it("throws NotFoundException when ad account not found by either ID", async () => {
      const { prisma } = require("@ecomdash/database");
      jest.mocked(prisma.adAccount.findFirst).mockResolvedValue(null);

      await expect(
        service.getBudgetForecast("nonexistent", "2024-01", "org1")
      ).rejects.toThrow(NotFoundException);
    });

    it("falls back to querying by internal ID when tiktokAdvertiserId lookup yields no shopId", async () => {
      const { prisma } = require("@ecomdash/database");
      jest.mocked(prisma.adAccount.findFirst)
        .mockResolvedValueOnce({ shopId: null })
        .mockResolvedValueOnce({ shopId: "shop-fallback" });
      mockQuery.mockResolvedValue([]);

      const result = await service.getBudgetForecast("acc1", "2024-01", "org1");

      expect(result.currentSpend).toBe(0);
      expect(jest.mocked(prisma.adAccount.findFirst)).toHaveBeenCalledTimes(2);
    });

    it("queries ClickHouse with resolved shopId", async () => {
      const { prisma } = require("@ecomdash/database");
      jest.mocked(prisma.adAccount.findFirst).mockResolvedValue({ shopId: "shop-abc" });
      mockQuery.mockResolvedValue([]);

      await service.getBudgetForecast("acc1", "2024-01", "org1");

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const params = mockQuery.mock.calls[0][1];
      expect(params.shopId).toBe("shop-abc");
    });
  });
});
