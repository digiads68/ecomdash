import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { addDays, toBusinessDate } from "@ecomdash/shared";
import { PnlService } from "../pnl/pnl.service";
import { notify } from "../notify/notify";

const vnd = (v: number | null | undefined) => `${Math.round(v ?? 0).toLocaleString("vi-VN")} ₫`;
const x = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}×`);

/** 04 §8 — 08:00 VN; ISO weekday 1–7; lastSentAt only after a successful send. */
@Injectable()
export class ReportsSender {
  private readonly logger = new Logger("Reports");
  constructor(private readonly pnl: PnlService) {}

  async sendDue(now = new Date()) {
    const configs = await prisma.reportConfig.findMany({ where: { isActive: true }, include: { shop: true } });
    let sent = 0;
    for (const c of configs) {
      const today = toBusinessDate(now, c.shop.timezone);
      const iso = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      const day = Number(today.slice(8, 10));
      const due = c.frequency === "daily" || (c.frequency === "weekly" && iso === (c.dayOfWeek ?? 1)) || (c.frequency === "monthly" && day === (c.dayOfMonth ?? 1));
      if (!due || (c.lastSentAt && toBusinessDate(c.lastSentAt, c.shop.timezone) === today)) continue;
      const span = c.frequency === "daily" ? 1 : c.frequency === "weekly" ? 7 : 30;
      const to = addDays(today, -1);
      const s = await this.pnl.summary(c.organizationId, c.shopId, addDays(to, -(span - 1)), to);
      const text = [
        `Kỳ ${s.period.from} → ${s.period.to} (đã chốt ${Math.round((s.period.settledShare ?? 0) * 100)}% giá trị đơn)`,
        `Đơn đặt: ${s.orders.paid.count} · thành công ${s.orders.success.count} · huỷ ${s.orders.cancelled.count} · hoàn ${s.orders.returned.count + s.orders.partialReturn.count}`,
        `Doanh thu thực: ${vnd(s.kpis.realizedRevenue.value)}`,
        `Chi quảng cáo: ${vnd(s.ads.spend)} · ROAS TikTok ${x(s.roas.tiktok)} → ROAS thực ${x(s.roas.real)} (hoà vốn ${x(s.roas.breakEven)})`,
        `Lãi ròng: ${vnd(s.kpis.netProfit.value)}`,
      ].join("\n");
      await notify([{ type: "email", to: c.recipientEmail }], `[EcomDash] Báo cáo ${c.frequency === "daily" ? "ngày" : c.frequency === "weekly" ? "tuần" : "tháng"} — ${c.shop.name}`, text);
      await prisma.reportConfig.update({ where: { id: c.id }, data: { lastSentAt: new Date() } });
      sent++;
    }
    this.logger.log(`sent ${sent} reports`);
    return sent;
  }
}
