import { hashSeed, rng } from "./rng";
import { vnDate, vnMidnight, World } from "./world";

export interface StoreW { storeId: string; storeName: string; storeCode: string; gmvMax: boolean; shopIdx: number | null }
export interface CampaignW {
  id: string; name: string; kind: "MANUAL" | "GMV_MAX"; budget: number; budgetMode: "BUDGET_MODE_DAY" | "BUDGET_MODE_TOTAL";
  roas: number; roasBid?: number; storeId?: string; activeFrom?: string; activeTo?: string; disabledLastDays?: number; shoppingType: string;
}
export interface AdvertiserW { id: string; name: string; currency: string; timezone: string; bcId: string; seller: string; stores: StoreW[]; campaigns: CampaignW[] }

/** Who can grant an ads token: a seller's own Business Center, or the DigiAds agency BC that clients shared accounts into. */
export const DIGIADS_BC = "7300009999000001";
export const ADS_PRINCIPALS = [
  { id: "hoasen", label: "Business Center: Hoa Sen Group", kind: "CLIENT" },
  { id: "may", label: "Tài khoản quảng cáo: Thời Trang Mây", kind: "CLIENT" },
  { id: "bin", label: "Tài khoản quảng cáo: Đồ Chơi Bin", kind: "CLIENT" },
  { id: "digiads", label: "Business Center: DigiAds (agency)", kind: "AGENCY" },
] as const;

/** Advertisers visible to a principal; the DigiAds BC sees the accounts shared with it. */
export function advertisersFor(all: AdvertiserW[], principal: string): AdvertiserW[] {
  if (principal === "digiads") return all.filter((a) => a.bcId === DIGIADS_BC || SHARED_WITH_DIGIADS.has(a.id));
  return all.filter((a) => a.seller === principal);
}
const SHARED_WITH_DIGIADS = new Set(["7301122334455667788"]);

export function buildAdvertisers(world: World): AdvertiserW[] {
  const [s0, s1, s2, s3] = world.shops;
  const year = vnDate(world.bootTime).slice(0, 4);
  return [
    {
      id: "7301122334455667788", name: "Hoa Sen Beauty — Ads", currency: "VND", timezone: "Asia/Ho_Chi_Minh", bcId: "7300001111222233", seller: "hoasen",
      stores: [{ storeId: s0.id, storeName: s0.name, storeCode: s0.code, gmvMax: true, shopIdx: 0 }],
      campaigns: [
        { id: "1780011000000000001", name: "Serum C – Video Shopping", kind: "MANUAL", budget: 1_800_000, budgetMode: "BUDGET_MODE_DAY", roas: 4.6, shoppingType: "VIDEO" },
        { id: "1780011000000000002", name: "Kem chống nắng – LIVE tối", kind: "MANUAL", budget: 1_500_000, budgetMode: "BUDGET_MODE_DAY", roas: 4.1, shoppingType: "LIVE" },
        { id: "1780011000000000003", name: "Son Velvet – Product Shopping", kind: "MANUAL", budget: 1_100_000, budgetMode: "BUDGET_MODE_DAY", roas: 1.55, shoppingType: "PRODUCT_SHOPPING_ADS" },
        { id: "1780011000000000004", name: "Toner – Retarget 7 ngày", kind: "MANUAL", budget: 700_000, budgetMode: "BUDGET_MODE_DAY", roas: 4.4, shoppingType: "VIDEO" },
        { id: "1780011000000000005", name: "Mặt nạ ngủ – Video A/B", kind: "MANUAL", budget: 800_000, budgetMode: "BUDGET_MODE_DAY", roas: 1.35, disabledLastDays: 10, shoppingType: "VIDEO" },
        { id: "1780011000000000006", name: "Sale 11.11 – Toàn shop", kind: "MANUAL", budget: 30_000_000, budgetMode: "BUDGET_MODE_TOTAL", roas: 5.2, activeFrom: `${year}-11-08`, activeTo: `${year}-11-12`, shoppingType: "VIDEO" },
        { id: "1780011000000000101", name: "GMV Max – Sản phẩm chủ lực", kind: "GMV_MAX", budget: 3_000_000, budgetMode: "BUDGET_MODE_DAY", roas: 5.5, roasBid: 5, storeId: s0.id, shoppingType: "PRODUCT" },
        { id: "1780011000000000102", name: "GMV Max – LIVE", kind: "GMV_MAX", budget: 2_000_000, budgetMode: "BUDGET_MODE_DAY", roas: 4.4, roasBid: 4, storeId: s0.id, shoppingType: "LIVE" },
      ],
    },
    {
      id: "7301199887766554433", name: "Hoa Sen Home — Ads", currency: "VND", timezone: "Asia/Ho_Chi_Minh", bcId: "7300001111222233", seller: "hoasen",
      stores: [
        { storeId: "8800112233445566", storeName: s1.name, storeCode: s1.code, gmvMax: true, shopIdx: 1 },
        { storeId: "7495000011112222", storeName: "HS Outlet", storeCode: "VNLCOUT001", gmvMax: false, shopIdx: null },
      ],
      campaigns: [
        { id: "1780022000000000001", name: "Chảo chống dính – Video", kind: "MANUAL", budget: 600_000, budgetMode: "BUDGET_MODE_DAY", roas: 3.2, shoppingType: "VIDEO" },
        { id: "1780022000000000002", name: "Nồi chiên – LIVE", kind: "MANUAL", budget: 500_000, budgetMode: "BUDGET_MODE_DAY", roas: 2.1, shoppingType: "LIVE" },
        { id: "1780022000000000003", name: "Móc dán – Product Shopping", kind: "MANUAL", budget: 300_000, budgetMode: "BUDGET_MODE_DAY", roas: 2.8, shoppingType: "PRODUCT_SHOPPING_ADS" },
        { id: "1780022000000000101", name: "GMV Max – Gia dụng", kind: "GMV_MAX", budget: 900_000, budgetMode: "BUDGET_MODE_DAY", roas: 4.2, roasBid: 4, storeId: "8800112233445566", shoppingType: "PRODUCT" },
      ],
    },
    {
      id: "7301255500011122233", name: "Thời Trang Mây — Ads", currency: "VND", timezone: "Asia/Ho_Chi_Minh", bcId: DIGIADS_BC, seller: "may",
      stores: [{ storeId: s2.id, storeName: s2.name, storeCode: s2.code, gmvMax: true, shopIdx: 2 }],
      campaigns: [
        { id: "1780033000000000001", name: "Đầm hoa – Video", kind: "MANUAL", budget: 700_000, budgetMode: "BUDGET_MODE_DAY", roas: 3.6, shoppingType: "VIDEO" },
        { id: "1780033000000000002", name: "Áo sơ mi – LIVE", kind: "MANUAL", budget: 500_000, budgetMode: "BUDGET_MODE_DAY", roas: 2.4, shoppingType: "LIVE" },
        { id: "1780033000000000101", name: "GMV Max – Thời trang", kind: "GMV_MAX", budget: 1_200_000, budgetMode: "BUDGET_MODE_DAY", roas: 4.8, roasBid: 4.5, storeId: s2.id, shoppingType: "PRODUCT" },
      ],
    },
    {
      id: "7301277700033344455", name: "Đồ Chơi Bin — Ads", currency: "VND", timezone: "Asia/Ho_Chi_Minh", bcId: DIGIADS_BC, seller: "bin",
      stores: [{ storeId: s3.id, storeName: s3.name, storeCode: s3.code, gmvMax: true, shopIdx: 3 }],
      campaigns: [
        { id: "1780044000000000001", name: "Xếp hình nam châm – Video", kind: "MANUAL", budget: 400_000, budgetMode: "BUDGET_MODE_DAY", roas: 3.1, shoppingType: "VIDEO" },
        { id: "1780044000000000101", name: "GMV Max – Đồ chơi", kind: "GMV_MAX", budget: 500_000, budgetMode: "BUDGET_MODE_DAY", roas: 4.0, roasBid: 3.8, storeId: s3.id, shoppingType: "PRODUCT" },
      ],
    },
  ];
}

export interface DayStat { spend: number; impressions: number; clicks: number; conversions: number; orders: number; revenue: number }

/** Deterministic per campaign-day; the last 3 days drift slightly between calls (late attribution). */
export function campaignDay(world: World, c: CampaignW, ymd: string): DayStat | null {
  // MOCK_ADS_DELAY_MIN: the Ads API lags behind the Shop API (12 §4 — tests the "ads are late" banner).
  const now = world.now() - world.config.adsDelayMin * 60;
  const today = vnDate(now);
  if (ymd > today || vnMidnight(ymd) < world.startTime) return null;
  if (c.activeFrom && ymd < c.activeFrom) return null;
  if (c.activeTo && ymd > c.activeTo) return null;
  const daysAgo = Math.round((vnMidnight(today) - vnMidnight(ymd)) / 86_400);
  if (c.disabledLastDays && daysAgo < c.disabledLastDays) return null;
  const r = rng(hashSeed(world.config.seed, c.id, ymd));
  const event = /-(09-09|10-10|11-11|12-12)$/.test(ymd) ? 1.9 : 1;
  const daily = c.budgetMode === "BUDGET_MODE_TOTAL" ? c.budget / 5 : c.budget;
  let spend = daily * r.between(0.72, 1) * event;
  if (ymd === today) spend *= Math.min(1, (now - vnMidnight(ymd)) / 86_400);
  const drift = daysAgo < 3 ? 1 + (Math.random() - 0.5) * 0.06 : 1;
  const roas = c.roas * r.between(0.78, 1.22) * drift;
  const revenue = spend * roas;
  const impressions = Math.round((spend / r.between(25_000, 60_000)) * 1000);
  const clicks = Math.round(impressions * r.between(0.01, 0.035));
  const orders = Math.round(revenue / r.between(240_000, 320_000));
  return { spend: Math.round(spend), impressions, clicks, conversions: orders, orders, revenue: Math.round(revenue) };
}
