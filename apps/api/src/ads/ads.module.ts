import { Controller, Get, Module, Query } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import {
  AdsOverviewDto, adAllocationShares, AdStatus, CampaignRowDto, dateOnly, daysInMonth, roasMetrics, successEquivalent, sumDays, toBusinessDate,
} from "@ecomdash/shared";
import type { Access } from "../access/access";
import { Acc } from "../common/decorators";
import { div, getShopForUser, kpi, n, parsePeriod } from "../common/util";
import { PnlModule } from "../pnl/pnl.module";
import { PnlService } from "../pnl/pnl.service";

const status = (real: number | null, be: number | null, spend: number): AdStatus =>
  spend <= 0 ? "NO_SPEND" : real == null || be == null ? "LOSS" : real >= be * 1.2 ? "PROFIT" : real >= be ? "NEAR_BREAKEVEN" : "LOSS";

/** Campaign stats of advertisers linked to the shop, scaled by the shop's share (11 §6). */
async function scopedStats(orgId: string | null, shopId: string, from: string, to: string) {
  const links = await prisma.advertiserStoreLink.findMany({ where: { advertiser: { organizationId: orgId }, shopId: { not: null } } });
  const shopsOf = new Map<string, Set<string>>();
  for (const l of links) shopsOf.set(l.advertiserId, (shopsOf.get(l.advertiserId) ?? new Set()).add(l.shopId!));
  const advIds = [...shopsOf].filter(([, s]) => s.has(shopId)).map(([a]) => a);
  const share = new Map<string, number>();
  let proportional = false;
  for (const a of advIds) {
    const linked = [...shopsOf.get(a)!];
    if (linked.length === 1) { share.set(a, 1); continue; }
    proportional = true;
    const g = await prisma.shopDailyPnl.groupBy({ by: ["shopId"], where: { shopId: { in: linked }, date: { gte: dateOnly(from), lte: dateOnly(to) } }, _sum: { grossItemValue: true } });
    share.set(a, adAllocationShares(linked, Object.fromEntries(g.map((x) => [x.shopId, n(x._sum.grossItemValue)])))[shopId] ?? 0);
  }
  const storeShop = new Map(links.map((l) => [`${l.advertiserId}|${l.storeId}`, l.shopId]));
  const stats = advIds.length ? await prisma.adDailyStat.findMany({ where: { advertiserId: { in: advIds }, date: { gte: dateOnly(from), lte: dateOnly(to) } } }) : [];
  const scaled = stats.map((s) => {
    const f = s.source === "GMV_MAX" && s.storeId ? (storeShop.get(`${s.advertiserId}|${s.storeId}`) === shopId ? 1 : 0) : share.get(s.advertiserId) ?? 0;
    return { ...s, f, spend: n(s.spend) * f, grossRevenue: n(s.grossRevenue) * f, impressions: s.impressions * f, clicks: s.clicks * f, orders: s.orders * f };
  }).filter((s) => s.f > 0);
  return { stats: scaled, advIds, allocation: (advIds.length ? (proportional ? "PROPORTIONAL" : "DIRECT") : "NONE") as AdsOverviewDto["allocation"] };
}

@Controller("ads")
class AdsController {
  constructor(private readonly pnl: PnlService) {}

  @Get("overview")
  async overview(@Acc() access: Access, @Query() q: { shopId: string; from?: string; to?: string }): Promise<AdsOverviewDto> {
    const shop = await getShopForUser(access, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const [cur, prev, sc, scPrev] = await Promise.all([
      this.pnl.totals(shop.id, p.from, p.to), this.pnl.totals(shop.id, p.prevFrom, p.prevTo),
      scopedStats(shop.organizationId, shop.id, p.from, p.to), scopedStats(shop.organizationId, shop.id, p.prevFrom, p.prevTo),
    ]);
    const t = cur.totals, tp = prev.totals;
    const r = roasMetrics(t), rp = roasMetrics(tp);
    const sum = (list: typeof sc.stats, f: (s: (typeof sc.stats)[number]) => number) => list.reduce((x, s) => x + f(s), 0);
    const imp = sum(sc.stats, (s) => s.impressions), clk = sum(sc.stats, (s) => s.clicks);
    const impP = sum(scPrev.stats, (s) => s.impressions), clkP = sum(scPrev.stats, (s) => s.clicks);
    const eq = successEquivalent(t, t.pendingAmount > 0 ? t.pendingExpected / t.pendingAmount : 1);
    const eqP = successEquivalent(tp, tp.pendingAmount > 0 ? tp.pendingExpected / tp.pendingAmount : 1);
    const src = (source: "INTEGRATED" | "GMV_MAX") => {
      const l = sc.stats.filter((s) => s.source === source);
      const spend = sum(l, (s) => s.spend), rev = sum(l, (s) => s.grossRevenue);
      const tk = div(rev, spend);
      return { spend, orders: Math.round(sum(l, (s) => s.orders)), grossRevenue: rev, roasTiktok: tk, roasReal: tk != null && r.realizationRate != null ? tk * r.realizationRate : null };
    };
    const today = toBusinessDate(new Date(), shop.timezone);
    const monthStart = `${today.slice(0, 8)}01`;
    const month = await this.pnl.totals(shop.id, monthStart, today);
    const elapsed = Number(today.slice(8, 10));
    return {
      totals: {
        spend: kpi(t.adSpend, tp.adSpend), impressions: kpi(imp, impP), clicks: kpi(clk, clkP), ctr: kpi(div(clk, imp), div(clkP, impP)),
        cpc: kpi(div(t.adSpend, clk), div(tp.adSpend, clkP)), roasTiktok: kpi(r.tiktok, rp.tiktok), roasReal: kpi(r.real, rp.real),
        breakEven: kpi(r.breakEven, rp.breakEven), spendPerSuccessOrder: kpi(div(t.adSpend, eq), div(tp.adSpend, eqP)),
      },
      manual: src("INTEGRATED"),
      gmvMax: src("GMV_MAX"),
      status: r.status,
      realizationRate: r.realizationRate,
      daily: cur.days.map((d) => {
        const m = roasMetrics(sumDays([d]));
        return { date: d.date, manualSpend: d.adSpendManual, gmvMaxSpend: d.adSpendGmvMax, roasReal: m.real, breakEven: m.breakEven };
      }),
      budgetForecast: { monthToDateSpend: month.totals.adSpend, projectedMonthSpend: elapsed ? (month.totals.adSpend / elapsed) * daysInMonth(today) : 0, daysElapsed: elapsed, daysInMonth: daysInMonth(today) },
      allocation: sc.allocation,
    };
  }

  @Get("campaigns")
  async campaigns(@Acc() access: Access, @Query() q: { shopId: string; from?: string; to?: string; kind?: "MANUAL" | "GMV_MAX" }): Promise<CampaignRowDto[]> {
    const shop = await getShopForUser(access, q.shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const [{ totals: t }, sc] = await Promise.all([this.pnl.totals(shop.id, p.from, p.to), scopedStats(shop.organizationId, shop.id, p.from, p.to)]);
    const r = roasMetrics(t);
    const by = new Map<string, { spend: number; imp: number; clk: number; orders: number; rev: number }>();
    for (const s of sc.stats) {
      const a = by.get(s.campaignId) ?? { spend: 0, imp: 0, clk: 0, orders: 0, rev: 0 };
      a.spend += s.spend; a.imp += s.impressions; a.clk += s.clicks; a.orders += s.orders; a.rev += s.grossRevenue;
      by.set(s.campaignId, a);
    }
    const campaigns = await prisma.campaign.findMany({ where: { advertiserId: { in: sc.advIds }, ...(q.kind ? { kind: q.kind } : {}) }, include: { advertiser: true } });
    return campaigns
      .filter((c) => by.has(c.id) || c.operationStatus === "ENABLE")
      .map((c) => {
        const a = by.get(c.id) ?? { spend: 0, imp: 0, clk: 0, orders: 0, rev: 0 };
        const tk = div(a.rev, a.spend);
        const real = tk != null && r.realizationRate != null ? tk * r.realizationRate : null;
        return {
          id: c.id, tiktokCampaignId: c.tiktokCampaignId, name: c.name, kind: c.kind, advertiserName: c.advertiser.name, operationStatus: c.operationStatus,
          budget: c.budget != null ? n(c.budget) : null, budgetMode: c.budgetMode, roasBid: c.roasBid != null ? n(c.roasBid) : null,
          spend: a.spend, impressions: Math.round(a.imp), clicks: Math.round(a.clk), ctr: div(a.clk, a.imp), cpc: div(a.spend, a.clk), orders: Math.round(a.orders),
          grossRevenue: a.rev, roasTiktok: tk, realRoasEstimated: real, vsBreakEven: status(real, r.breakEven, a.spend),
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }
}

@Module({ imports: [PnlModule], controllers: [AdsController] })
export class AdsModule {}
