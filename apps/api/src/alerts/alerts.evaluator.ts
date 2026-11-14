import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { addDays, AlertCondition, dateOnly, roasMetrics, sumDays, toBusinessDate } from "@ecomdash/shared";
import { toDaily } from "../pnl/pnl.service";
import { Action, notify } from "../notify/notify";

const LABEL: Record<string, string> = {
  gmv: "GMV đặt hàng", orders: "Số đơn", ad_spend: "Chi quảng cáo", roas_tiktok: "ROAS TikTok", real_roas: "ROAS thực",
  real_roas_below_breakeven: "ROAS thực dưới hoà vốn", net_profit: "Lãi ròng", net_margin: "Biên lãi ròng", cancel_rate: "Tỉ lệ huỷ", return_rate: "Tỉ lệ hoàn",
};
const WINDOW: Record<string, string> = { today: "hôm nay", "24h": "24 giờ", "7d": "7 ngày" };
const OPS: Record<string, (a: number, b: number) => boolean> = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b };

/** 04 §7 — rules read the daily P&L table. */
@Injectable()
export class AlertsEvaluator {
  private readonly logger = new Logger("Alerts");

  async metric(shopId: string, c: AlertCondition, timeZone: string): Promise<number | null> {
    const today = toBusinessDate(new Date(), timeZone);
    const from = c.window === "7d" ? addDays(today, -6) : c.window === "24h" ? addDays(today, -1) : today;
    const rows = await prisma.shopDailyPnl.findMany({ where: { shopId, date: { gte: dateOnly(from), lte: dateOnly(today) } } });
    if (!rows.length) return null;
    const t = sumDays(rows.map(toDaily));
    const r = roasMetrics(t);
    const net = t.contribution - t.adSpend;
    switch (c.metric) {
      case "gmv": return t.grossItemValue;
      case "orders": return t.ordersPaid;
      case "ad_spend": return t.adSpend;
      case "roas_tiktok": return r.tiktok;
      case "real_roas": return r.real;
      case "real_roas_below_breakeven": return t.adSpend > 0 ? (r.status === "LOSS" ? 1 : 0) : null;
      case "net_profit": return net;
      case "net_margin": return t.realizedRevenue > 0 ? net / t.realizedRevenue : null;
      case "cancel_rate": return t.ordersPaid ? t.ordersCancelled / t.ordersPaid : null;
      case "return_rate": return t.ordersPaid ? (t.ordersReturned + t.ordersPartial) / t.ordersPaid : null;
    }
    return null;
  }

  async evaluateAll() {
    const rules = await prisma.alertRule.findMany({ where: { isActive: true } });
    let fired = 0;
    for (const rule of rules) {
      const shops = await prisma.shop.findMany({ where: { organizationId: rule.organizationId, isActive: true, ...(rule.shopId ? { id: rule.shopId } : {}) } });
      const conds = ((rule.conditions as any)?.conditions ?? rule.conditions) as AlertCondition[];
      const logic = (rule.conditions as any)?.logic === "OR" ? "OR" : "AND";
      for (const shop of shops) {
        const values = await Promise.all(conds.map((c) => this.metric(shop.id, c, shop.timezone)));
        const hits = conds.map((c, i) => values[i] != null && OPS[c.operator]?.(values[i]!, c.threshold));
        const firing = logic === "AND" ? hits.every(Boolean) : hits.some(Boolean);
        const open = await prisma.alertInstance.findFirst({ where: { ruleId: rule.id, shopId: shop.id, state: "FIRING" } });
        if (firing && !open) {
          const detail = conds.map((c, i) => `${LABEL[c.metric]} ${WINDOW[c.window] ?? c.window}: ${fmt(c.metric, values[i])}`).join("; ");
          await prisma.alertInstance.create({ data: { ruleId: rule.id, organizationId: rule.organizationId, shopId: shop.id, title: `${rule.name} — ${shop.name}`, state: "FIRING", metadata: { detail, values } } });
          await notify((rule.actions as any)?.actions ?? (rule.actions as Action[]), `[EcomDash] ${rule.name} — ${shop.name}`, detail);
          fired++;
        } else if (!firing && open) {
          await prisma.alertInstance.update({ where: { id: open.id }, data: { state: "RESOLVED", resolvedAt: new Date() } });
        }
      }
    }
    this.logger.log(`evaluated ${rules.length} rules, fired ${fired}`);
    return fired;
  }
}

function fmt(metric: string, v: number | null) {
  if (v == null) return "—";
  if (metric.includes("rate") || metric === "net_margin") return `${(v * 100).toFixed(1)}%`;
  if (metric.includes("roas")) return metric === "real_roas_below_breakeven" ? (v ? "có" : "không") : `${v.toFixed(2)}×`;
  return `${Math.round(v).toLocaleString("vi-VN")}`;
}
