import type { Access } from "../access/access";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import ExcelJS from "exceljs";
import { prisma, Prisma } from "@ecomdash/database";
import { addDays, CostItemDto, CostSkuListDto, dateOnly, ShopConfigDto, toBusinessDate, ymd } from "@ecomdash/shared";
import { getShopForUser, n, pageParams, parsePeriod } from "../common/util";
import { QueueService } from "../sync/queue.service";

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const METHODS = ["PER_ORDER", "PERCENT_REVENUE", "MONTHLY_FIXED"] as const;
const APPLIES = ["PAID", "SHIPPED", "SUCCESS"] as const;

export interface SkuCostInput { skuId: string; unitCost: number; effectiveFrom: string }
export interface CostItemInput { name: string; method: (typeof METHODS)[number]; amount: number; appliesTo?: (typeof APPLIES)[number]; effectiveFrom: string; effectiveTo?: string | null; isActive?: boolean }

@Injectable()
export class CostsService {
  constructor(private readonly queue: QueueService) {}

  // ───── SKU costs (11 §3.1) ─────
  async listSkus(access: Access, shopId: string, q: { missing?: string; q?: string; page?: string; pageSize?: string }): Promise<CostSkuListDto> {
    const shop = await getShopForUser(access, shopId);
    const today = toBusinessDate(new Date(), shop.timezone);
    const skus = await prisma.sku.findMany({
      where: {
        product: { shopId: shop.id, status: "ACTIVATE" },
        ...(q.q ? { OR: [{ sellerSku: { contains: q.q, mode: "insensitive" } }, { name: { contains: q.q, mode: "insensitive" } }, { product: { title: { contains: q.q, mode: "insensitive" } } }] } : {}),
      },
      include: { product: true, costs: { where: { effectiveFrom: { lte: dateOnly(today) } }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
      orderBy: [{ product: { title: "asc" } }, { tiktokSkuId: "asc" }],
    });
    const sold = await prisma.$queryRaw<{ sku: string; units: number }[]>`
      SELECT li."tiktokSkuId" sku, COUNT(*)::int units FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
      WHERE o."shopId" = ${shop.id} AND o."paidTime" IS NOT NULL AND o.status <> 'CANCELLED' AND o."businessDate" >= ${dateOnly(addDays(today, -29))} GROUP BY 1`;
    const soldMap = new Map(sold.map((s) => [s.sku, s.units]));
    let rows = skus.map((s) => ({
      skuId: s.id, tiktokSkuId: s.tiktokSkuId, sellerSku: s.sellerSku, productId: s.productId, productTitle: s.product.title, thumbnailUrl: s.product.thumbnailUrl,
      skuName: s.name, salePrice: n(s.salePrice), unitCost: s.costs[0] ? n(s.costs[0].unitCost) : null, effectiveFrom: s.costs[0] ? ymd(s.costs[0].effectiveFrom) : null,
      unitsSold30d: soldMap.get(s.tiktokSkuId) ?? 0,
    }));
    const missingCount = rows.filter((r) => r.unitCost == null).length;
    const totalSkus = rows.length;
    const missingRevenue = rows.filter((r) => r.unitCost == null).reduce((s, r) => s + r.unitsSold30d * r.salePrice, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.unitsSold30d * r.salePrice, 0);
    if (q.missing === "true") rows = rows.filter((r) => r.unitCost == null);
    rows.sort((a, b) => b.unitsSold30d - a.unitsSold30d);
    const { page, pageSize, skip, take } = pageParams(q.page, q.pageSize, 500);
    return { items: rows.slice(skip, skip + take), total: rows.length, page, pageSize, missingCount, totalSkus, missingRevenueShare: totalRevenue > 0 ? missingRevenue / totalRevenue : null };
  }

  async upsertSkuCosts(access: Access, shopId: string, items: SkuCostInput[]) {
    const shop = await getShopForUser(access, shopId, "edit");
    if (!Array.isArray(items) || !items.length) throw new BadRequestException("items is required");
    const skus = await prisma.sku.findMany({ where: { id: { in: items.map((i) => i.skuId) }, product: { shopId: shop.id } }, select: { id: true } });
    const ok = new Set(skus.map((s) => s.id));
    for (const i of items) {
      if (!ok.has(i.skuId)) throw new NotFoundException(`SKU ${i.skuId} không thuộc shop này`);
      if (!(Number(i.unitCost) >= 0)) throw new BadRequestException("unitCost must be ≥ 0");
      if (!YMD.test(i.effectiveFrom)) throw new BadRequestException("effectiveFrom must be YYYY-MM-DD");
    }
    await prisma.$transaction(items.map((i) => prisma.skuCost.upsert({
      where: { skuId_effectiveFrom: { skuId: i.skuId, effectiveFrom: dateOnly(i.effectiveFrom) } },
      create: { shopId: shop.id, skuId: i.skuId, unitCost: Number(i.unitCost), effectiveFrom: dateOnly(i.effectiveFrom) },
      update: { unitCost: Number(i.unitCost) },
    })));
    const from = items.map((i) => i.effectiveFrom).sort()[0];
    await this.queue.requestPnlRecompute(shop.id, from);
    return { saved: items.length, recomputeFrom: from };
  }

  async exportSkus(access: Access, shopId: string, format: "xlsx" | "csv") {
    const list = await this.listSkus(access, shopId, { pageSize: "500" });
    const header = ["tiktok_sku_id", "seller_sku", "product_title", "sku_name", "sale_price", "unit_cost", "effective_from"];
    const data = list.items.map((r) => [r.tiktokSkuId, r.sellerSku ?? "", r.productTitle, r.skuName ?? "", r.salePrice, r.unitCost ?? "", r.effectiveFrom ?? ""]);
    if (format === "csv") {
      const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
      return { body: Buffer.from("﻿" + [header, ...data].map((r) => r.map(esc).join(",")).join("\n"), "utf8"), type: "text/csv; charset=utf-8", ext: "csv" };
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Gia von");
    ws.addRow(header);
    data.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => (c.width = 22));
    return { body: Buffer.from(await wb.xlsx.writeBuffer()), type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" };
  }

  /** Rows that don't match a SKU are reported by row number and skipped (11 §3.1). */
  async importSkus(access: Access, shopId: string, file: { buffer: Buffer; originalname: string } | undefined) {
    const shop = await getShopForUser(access, shopId, "edit");
    if (!file) throw new BadRequestException("file is required");
    let rows: string[][] = [];
    if (file.originalname.toLowerCase().endsWith(".csv")) {
      rows = file.buffer.toString("utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).map((l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"')));
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file.buffer as any);
      wb.worksheets[0].eachRow((r) => rows.push((r.values as unknown[]).slice(1).map((v) => (v instanceof Date ? ymd(v) : String(v ?? "")))));
    }
    const [header, ...body] = rows;
    const col = (name: string) => header?.findIndex((h) => h.trim().toLowerCase() === name) ?? -1;
    const cSku = col("tiktok_sku_id"), cSeller = col("seller_sku"), cCost = col("unit_cost"), cFrom = col("effective_from");
    if (cCost < 0 || (cSku < 0 && cSeller < 0)) throw new BadRequestException("File cần cột unit_cost và tiktok_sku_id hoặc seller_sku");
    const skus = await prisma.sku.findMany({ where: { product: { shopId: shop.id } }, select: { id: true, tiktokSkuId: true, sellerSku: true } });
    const byTk = new Map(skus.map((s) => [s.tiktokSkuId, s.id]));
    const bySeller = new Map(skus.filter((s) => s.sellerSku).map((s) => [s.sellerSku!, s.id]));
    const today = toBusinessDate(new Date(), shop.timezone);
    const items: SkuCostInput[] = [];
    const errors: { row: number; message: string }[] = [];
    body.forEach((r, i) => {
      const rowNo = i + 2;
      const cost = r[cCost]?.trim();
      if (!cost) return;
      const skuId = (cSku >= 0 && byTk.get(r[cSku]?.trim())) || (cSeller >= 0 && bySeller.get(r[cSeller]?.trim())) || null;
      const value = Number(cost.replace(/[.\s₫]/g, "").replace(",", "."));
      const from = cFrom >= 0 && YMD.test(r[cFrom]?.trim() ?? "") ? r[cFrom].trim() : today;
      if (!skuId) errors.push({ row: rowNo, message: "Không tìm thấy SKU" });
      else if (!(value >= 0)) errors.push({ row: rowNo, message: `Giá vốn không hợp lệ: ${cost}` });
      else items.push({ skuId, unitCost: value, effectiveFrom: from });
    });
    if (items.length) await this.upsertSkuCosts(access, shopId, items);
    return { imported: items.length, errors };
  }

  // ───── cost items (11 §3.2) ─────
  private itemDto(i: Prisma.CostItemGetPayload<object>, amountInPeriod?: number): CostItemDto {
    return {
      id: i.id, shopId: i.shopId, name: i.name, method: i.method, amount: n(i.amount), appliesTo: i.appliesTo, effectiveFrom: ymd(i.effectiveFrom),
      effectiveTo: i.effectiveTo ? ymd(i.effectiveTo) : null, isActive: i.isActive, amountInPeriod,
    };
  }

  async listItems(access: Access, shopId: string, from?: string, to?: string): Promise<CostItemDto[]> {
    const shop = await getShopForUser(access, shopId);
    const p = parsePeriod(from, to, shop.timezone);
    const items = await prisma.costItem.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: "asc" } });
    const pnl = await prisma.shopDailyPnl.findMany({ where: { shopId: shop.id, date: { gte: dateOnly(p.from), lte: dateOnly(p.to) } }, select: { customBreakdown: true } });
    const sums: Record<string, number> = {};
    for (const r of pnl) for (const [k, v] of Object.entries(r.customBreakdown as Record<string, number>)) sums[k] = (sums[k] ?? 0) + v;
    return items.map((i) => this.itemDto(i, Math.round(sums[i.id] ?? 0)));
  }

  private validate(b: Partial<CostItemInput>, partial = false) {
    if (!partial || b.name !== undefined) if (!b.name?.trim()) throw new BadRequestException("name is required");
    if (!partial || b.method !== undefined) if (!METHODS.includes(b.method as any)) throw new BadRequestException("method is invalid");
    if (!partial || b.amount !== undefined) if (!(Number(b.amount) >= 0)) throw new BadRequestException("amount must be ≥ 0");
    if (b.method === "PERCENT_REVENUE" && Number(b.amount) > 100) throw new BadRequestException("percent must be ≤ 100");
    if (b.appliesTo !== undefined && !APPLIES.includes(b.appliesTo)) throw new BadRequestException("appliesTo is invalid");
    if (!partial || b.effectiveFrom !== undefined) if (!YMD.test(b.effectiveFrom ?? "")) throw new BadRequestException("effectiveFrom must be YYYY-MM-DD");
    if (b.effectiveTo && !YMD.test(b.effectiveTo)) throw new BadRequestException("effectiveTo must be YYYY-MM-DD");
  }

  async createItem(access: Access, shopId: string, b: CostItemInput) {
    const shop = await getShopForUser(access, shopId, "edit");
    this.validate(b);
    const i = await prisma.costItem.create({
      data: {
        shopId: shop.id, name: b.name.trim(), method: b.method, amount: Number(b.amount), appliesTo: b.appliesTo ?? "SHIPPED",
        effectiveFrom: dateOnly(b.effectiveFrom), effectiveTo: b.effectiveTo ? dateOnly(b.effectiveTo) : null, isActive: b.isActive ?? true,
      },
    });
    await this.queue.requestPnlRecompute(shop.id, b.effectiveFrom);
    return this.itemDto(i);
  }

  async updateItem(access: Access, id: string, b: Partial<CostItemInput>) {
    const cur = await prisma.costItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException();
    await getShopForUser(access, cur.shopId, "edit");
    this.validate({ ...b, method: b.method ?? cur.method }, true);
    const i = await prisma.costItem.update({
      where: { id },
      data: {
        ...(b.name !== undefined ? { name: b.name.trim() } : {}), ...(b.method ? { method: b.method } : {}), ...(b.amount !== undefined ? { amount: Number(b.amount) } : {}),
        ...(b.appliesTo ? { appliesTo: b.appliesTo } : {}), ...(b.effectiveFrom ? { effectiveFrom: dateOnly(b.effectiveFrom) } : {}),
        ...(b.effectiveTo !== undefined ? { effectiveTo: b.effectiveTo ? dateOnly(b.effectiveTo) : null } : {}), ...(b.isActive !== undefined ? { isActive: !!b.isActive } : {}),
      },
    });
    await this.queue.requestPnlRecompute(cur.shopId, [ymd(cur.effectiveFrom), b.effectiveFrom].filter(Boolean).sort()[0]!);
    return this.itemDto(i);
  }

  async deleteItem(access: Access, id: string) {
    const cur = await prisma.costItem.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException();
    await getShopForUser(access, cur.shopId, "edit");
    await prisma.costItem.delete({ where: { id } });
    await this.queue.requestPnlRecompute(cur.shopId, ymd(cur.effectiveFrom));
    return { ok: true };
  }

  // ───── shop config (11 §3.3) ─────
  async getConfig(access: Access, shopId: string): Promise<ShopConfigDto> {
    const shop = await getShopForUser(access, shopId);
    const c = await prisma.shopConfig.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} });
    return { defaultCogsPercent: n(c.defaultCogsPercent), restockReturns: c.restockReturns };
  }

  async setConfig(access: Access, shopId: string, b: Partial<ShopConfigDto>) {
    const shop = await getShopForUser(access, shopId, "edit");
    if (b.defaultCogsPercent !== undefined && !(b.defaultCogsPercent >= 0 && b.defaultCogsPercent <= 100)) throw new BadRequestException("defaultCogsPercent must be 0–100");
    const data = { ...(b.defaultCogsPercent !== undefined ? { defaultCogsPercent: b.defaultCogsPercent } : {}), ...(b.restockReturns !== undefined ? { restockReturns: !!b.restockReturns } : {}) };
    const c = await prisma.shopConfig.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id, ...data }, update: data });
    await this.queue.requestPnlRecompute(shop.id, addDays(toBusinessDate(new Date(), shop.timezone), -400));
    return { defaultCogsPercent: n(c.defaultCogsPercent), restockReturns: c.restockReturns };
  }
}

