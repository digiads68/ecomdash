import { Test } from "@nestjs/testing";
import { ExportService } from "./export.service";
import { ClickHouseService } from "../metrics/clickhouse.service";
import { BadRequestException } from "@nestjs/common";

const mockQuery = jest.fn();

jest.mock("@ecomdash/database", () => ({
  prisma: {
    shop: { findFirstOrThrow: jest.fn() },
    campaign: { findMany: jest.fn() },
  },
}));

function mockResponse() {
  const chunks: Buffer[] = [];
  const res = {
    setHeader: jest.fn(),
    end: jest.fn((data?: any) => {
      if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)));
    }),
    write: jest.fn((data: any) => chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data)))),
    getBody: () => chunks.map((c) => c.toString()).join(""),
  };
  return res;
}

describe("ExportService", () => {
  let service: ExportService;

  beforeEach(async () => {
    const { prisma } = require("@ecomdash/database");
    mockQuery.mockReset();
    jest.mocked(prisma.shop.findFirstOrThrow).mockReset();
    jest.mocked(prisma.campaign.findMany).mockReset();
    jest.mocked(prisma.campaign.findMany).mockResolvedValue([]);
    jest.mocked(prisma.shop.findFirstOrThrow).mockResolvedValue({ id: "shop1", organizationId: "org1" });

    const module = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: ClickHouseService, useValue: { query: mockQuery } },
      ],
    }).compile();

    service = module.get(ExportService);
  });

  it("throws BadRequestException for unknown export type", async () => {
    const res = mockResponse() as any;

    await expect(
      service.exportData("org1", "unknown" as any, "csv", "2024-01-01", "2024-01-31", undefined, undefined, res)
    ).rejects.toThrow(BadRequestException);
  });

  describe("orders CSV export", () => {
    it("generates valid CSV with header and data rows", async () => {
      mockQuery.mockResolvedValue([
        { date: "2024-01-15", gmv: 1000000, order_count: 10 },
      ]);

      const res = mockResponse() as any;
      await service.exportData("org1", "orders", "csv", "2024-01-01", "2024-01-31", undefined, undefined, res);

      expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/csv; charset=utf-8");
      const body = res.getBody();
      expect(body).toContain("Ngày");
      expect(body).toContain("2024-01-15");
      expect(body).toContain("1000000");
      expect(body).toContain("10");
    });

    it("sets Content-Disposition with .csv filename", async () => {
      mockQuery.mockResolvedValue([]);

      const res = mockResponse() as any;
      await service.exportData("org1", "orders", "csv", "2024-01-01", "2024-01-31", undefined, undefined, res);

      const disposition: string = res.setHeader.mock.calls.find(
        (c: string[]) => c[0] === "Content-Disposition"
      )?.[1] ?? "";
      expect(disposition).toContain(".csv");
    });

    it("validates shopId ownership before querying ClickHouse", async () => {
      const { prisma } = require("@ecomdash/database");
      jest.mocked(prisma.shop.findFirstOrThrow).mockRejectedValue(new Error("Not found"));
      mockQuery.mockResolvedValue([]);

      const res = mockResponse() as any;
      await expect(
        service.exportData("org1", "orders", "csv", "2024-01-01", "2024-01-31", "wrong-shop", undefined, res)
      ).rejects.toThrow("Not found");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("uses parameterized query — shopId passed as param, not in SQL string", async () => {
      mockQuery.mockResolvedValue([]);

      const res = mockResponse() as any;
      await service.exportData("org1", "orders", "csv", "2024-01-01", "2024-01-31", "shop1", undefined, res);

      const sql: string = mockQuery.mock.calls[0][0];
      const params: Record<string, string> = mockQuery.mock.calls[0][1];
      expect(sql).toContain("{shopId:String}");
      expect(params.shopId).toBe("shop1");
      // The raw ID should not appear literally in the SQL template
      expect(sql).not.toContain("shop1");
    });

    it("includes orgId as parameterized value in orders query", async () => {
      mockQuery.mockResolvedValue([]);

      const res = mockResponse() as any;
      await service.exportData("org1", "orders", "csv", "2024-01-01", "2024-01-31", undefined, undefined, res);

      const params: Record<string, string> = mockQuery.mock.calls[0][1];
      expect(params.orgId).toBe("org1");
    });
  });

  describe("campaigns CSV export", () => {
    it("generates CSV with campaign headers", async () => {
      mockQuery.mockResolvedValue([
        { campaign_id: "c1", spend: 500000, impressions: 10000, clicks: 200, conversions: 5, gmv: 2000000 },
      ]);
      const { prisma } = require("@ecomdash/database");
      jest.mocked(prisma.campaign.findMany).mockResolvedValue([
        { tiktokCampaignId: "c1", name: "Black Friday" },
      ]);

      const res = mockResponse() as any;
      await service.exportData("org1", "campaigns", "csv", "2024-01-01", "2024-01-31", undefined, undefined, res);

      const body = res.getBody();
      expect(body).toContain("Chiến dịch");
      expect(body).toContain("Black Friday");
    });

    it("uses campaign_id as fallback name when not found in Postgres", async () => {
      mockQuery.mockResolvedValue([
        { campaign_id: "c-unknown", spend: 100, impressions: 0, clicks: 0, conversions: 0, gmv: 0 },
      ]);

      const res = mockResponse() as any;
      await service.exportData("org1", "campaigns", "csv", "2024-01-01", "2024-01-31", undefined, undefined, res);

      const body = res.getBody();
      expect(body).toContain("c-unknown");
    });

    it("calculates ROAS as 0 when ad spend is 0", async () => {
      mockQuery.mockResolvedValue([
        { campaign_id: "c1", spend: 0, impressions: 0, clicks: 0, conversions: 0, gmv: 1000 },
      ]);

      const res = mockResponse() as any;
      await service.exportData("org1", "campaigns", "csv", "2024-01-01", "2024-01-31", undefined, undefined, res);

      const body = res.getBody();
      const lines = body.split("\r\n");
      const dataLine = lines[1];
      // ROAS column (last) should be 0
      expect(dataLine).toContain('"0"');
    });

    it("calculates ROAS correctly when spend > 0", async () => {
      mockQuery.mockResolvedValue([
        { campaign_id: "c1", spend: 100000, impressions: 0, clicks: 0, conversions: 0, gmv: 400000 },
      ]);

      const res = mockResponse() as any;
      await service.exportData("org1", "campaigns", "csv", "2024-01-01", "2024-01-31", undefined, undefined, res);

      const body = res.getBody();
      expect(body).toContain('"4"'); // ROAS = 400000 / 100000 = 4
    });
  });
});
