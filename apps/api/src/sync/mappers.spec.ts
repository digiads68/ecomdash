process.env.DATABASE_URL ??= "postgresql://x";
process.env.DEMO_MODE = "true";
import { mapGmvMaxRow, mapIntegratedRow, mapOrder, mapSettlement } from "./mappers";

const order: any = {
  id: "577001", status: "CANCEL", create_time: 1731517200, update_time: 1731520800, paid_time: 1731517300, user_id: "u1",
  payment: { currency: "VND", sub_total: "180000", shipping_fee: "15000", seller_discount: "20000", platform_discount: "10000", total_amount: "195000", original_total_product_price: "210000" },
  recipient_address: { district_info: [{ address_level: "L0", address_name: "Việt Nam" }, { address_level: "L1", address_name: "Hà Nội" }] },
  line_items: [], is_cod: true,
};

describe("mappers", () => {
  it("maps an order: money strings → numbers, CANCEL → CANCELLED, province, VN business date, hashed buyer", () => {
    const m = mapOrder(order, "shop1", "Asia/Ho_Chi_Minh");
    expect(m.status).toBe("CANCELLED");
    expect(m.totalAmount).toBe(195000);
    expect(m.province).toBe("Hà Nội");
    expect((m.businessDate as Date).toISOString().slice(0, 10)).toBe("2024-11-14"); // 2024-11-13T17:00Z is 00:00 on the 14th in Vietnam
    expect(m.buyerHash).toHaveLength(32);
    expect(m.buyerHash).not.toContain("u1");
  });

  it("maps finance 202501 transactions: negative fees → positive columns, unknown fees → otherFees", () => {
    const s = mapSettlement([{
      statement_id: "st1", statement_time: 1731888000, currency: "VND", revenue_amount: "190000", fee_tax_amount: "-30000", shipping_cost_amount: "-8000", settlement_amount: "152000",
      sku_transactions: [{ sku_id: "s", fee_tax_breakdown: { fee: { platform_commission_amount: "-11400", transaction_fee_amount: "-7800", vn_fix_infrastructure_fee_amount: "-3000", mystery_fee_amount: "-1000" }, tax: { vat_amount: "-2850" } } }],
    }] as any, "o1");
    expect(s).toMatchObject({ revenueAmount: 190000, platformCommission: 11400, transactionFee: 7800, infrastructureFee: 3000, otherFees: 1000, taxAmount: 2850, settlementAmount: 152000, tiktokStatementId: "st1" });
  });

  it("keeps GMV Max ad fees out of platform fees so ads are not counted twice", () => {
    const s = mapSettlement([{
      currency: "VND", revenue_amount: "200000", fee_tax_amount: "-40000", shipping_cost_amount: "0", settlement_amount: "160000",
      sku_transactions: [{ sku_id: "s", fee_tax_breakdown: { fee: { platform_commission_amount: "-12000", gmv_max_ad_fee_amount: "-20000", affiliate_ads_commission_amount: "-8000" } } }],
    }] as any, "o2");
    expect(s).toMatchObject({ gmvMaxAdFee: 20000, otherFees: 0, affiliateAdsCommission: 8000, affiliateCommission: 8000, platformCommission: 12000 });
    const both = mapSettlement([{
      currency: "VND", revenue_amount: "200000", fee_tax_amount: "-20000", shipping_cost_amount: "0", settlement_amount: "180000", gmv_max_ad_fee_amount: "-20000",
      sku_transactions: [{ sku_id: "s", fee_tax_breakdown: { fee: { gmv_max_ad_fee_amount: "-20000" } } }],
    }] as any, "o3");
    expect(both.gmvMaxAdFee).toBe(20000); // reported at both levels → counted once
  });

  it("maps report rows from both ad sources", () => {
    const a = mapIntegratedRow({ dimensions: { campaign_id: "c1", stat_time_day: "2026-11-01 00:00:00" }, metrics: { spend: "100", impressions: "1000", clicks: "20", conversion: "3", complete_payment: "3", total_complete_payment_rate: "450" } });
    expect(a).toMatchObject({ date: "2026-11-01", spend: 100, orders: 3, grossRevenue: 450 });
    const g = mapGmvMaxRow({ dimensions: { campaign_id: "c2", stat_time_day: "2026-11-01 00:00:00" }, metrics: { cost: "200", orders: "5", gross_revenue: "1000" } });
    expect(g).toMatchObject({ spend: 200, orders: 5, grossRevenue: 1000 });
  });
});
