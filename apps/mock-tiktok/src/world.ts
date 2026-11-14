import { BEAUTY, CANCEL_REASONS, CARRIERS, HOME, ProductDef, PROVINCES, RETURN_REASONS, thumbDataUri } from "./catalog";
import { hashSeed, rng } from "./rng";
import type { MockConfig } from "./config";

export const VN_OFFSET = 7 * 3600;
const H = 3600;
const D = 86_400;

export interface SkuW { id: string; sellerSku: string; name: string; price: number; inventory: number }
export interface ProductW {
  id: string; shopIdx: number; title: string; status: string; category: string; createTime: number; updateTime: number;
  image: string; skus: SkuW[]; weight: number;
}
export interface UnitW {
  lineId: string; productId: string; productName: string; skuId: string; skuName: string; sellerSku: string; image: string;
  original: number; sellerDiscount: number; platformDiscount: number;
}
export interface ReturnW {
  id: string; type: "REFUND" | "RETURN_AND_REFUND" | "REPLACEMENT"; createTime: number; reason: string;
  timeline: [string, number][]; refundTotal: number; unitIdx: number[]; returnShipping: number;
}
export interface FeesW {
  commission: number; transaction: number; affiliate: number; infrastructure: number; shippingCost: number; tax: number;
  returnShipping: number; revenue: number; settlement: number;
}
export interface OrderW {
  id: string; shopIdx: number; userId: string; createTime: number; events: [number, string][];
  paidTime?: number; rtsTime?: number; collectionTime?: number; deliveryTime?: number; completeTime?: number; cancelTime?: number;
  cancelReason?: string; cancelInitiator?: string;
  units: UnitW[]; shippingFee: number; shippingPlatformDiscount: number; isCod: boolean; carrier: string; tracking: string;
  province: string; ret?: ReturnW; settleTime?: number; fees?: FeesW;
}
export interface ShopW { idx: number; id: string; name: string; cipher: string; code: string; baseOrders: number; products: ProductW[] }

export interface World {
  config: MockConfig;
  startTime: number;
  bootTime: number;
  shops: ShopW[];
  orders: OrderW[];
  ordersByShop: OrderW[][];
  orderById: Map<string, OrderW>;
  clockOffsetSec: number;
  now(): number;
}

const SHOP_SPECS = [
  { id: "7494012345678901234", name: "Hoa Sen Beauty Official", cipher: "ROW_mHs8Qb2xKpTq", code: "VNLCHS2X7Q", base: 170, catalog: BEAUTY, commission: 0.06 },
  { id: "7494098765432109876", name: "Hoa Sen Home & Living", cipher: "ROW_tZ3nW9cVaLe4", code: "VNLCHH9K3M", base: 45, catalog: HOME, commission: 0.05 },
];

const HOUR_WEIGHTS = [1, 0.6, 0.3, 0.2, 0.2, 0.3, 0.8, 1.6, 2.4, 3, 3.4, 4.4, 4.8, 4, 3, 2.8, 2.9, 3, 3.3, 3.8, 5.2, 6, 5.6, 3.2];
const EVENT_DAYS: Record<string, number> = { "09-09": 3.2, "10-10": 3.2, "11-11": 3.6, "12-12": 3.2 };

/** VN calendar date string for a unix second. */
export function vnDate(sec: number): string {
  return new Date((sec + VN_OFFSET) * 1000).toISOString().slice(0, 10);
}
/** Unix second of 00:00 VN for a YYYY-MM-DD. */
export function vnMidnight(ymd: string): number {
  return Date.parse(`${ymd}T00:00:00Z`) / 1000 - VN_OFFSET;
}

function buildProducts(shopIdx: number, defs: ProductDef[], startTime: number, seed: number): ProductW[] {
  const r = rng(hashSeed(seed, "products", shopIdx));
  return defs.map((p, i) => {
    const pid = `17${shopIdx + 2}${String(3829100 + i * 137).padStart(9, "0")}`;
    const created = startTime - r.int(90, 400) * D;
    return {
      id: pid,
      shopIdx,
      title: p.title,
      status: p.status ?? "ACTIVATE",
      category: p.category,
      createTime: created,
      updateTime: created + r.int(1, 80) * D,
      image: thumbDataUri(p.title, p.color),
      weight: p.status ? 0 : 1 / Math.pow(i + 1, 0.9),
      skus: p.skus.map((s, j) => ({
        id: `${pid.slice(0, 6)}${String(51200 + i * 10 + j).padStart(7, "0")}`,
        sellerSku: `${shopIdx ? "HH" : "HS"}-${String(i + 1).padStart(3, "0")}-${j + 1}`,
        name: s.name,
        price: s.price,
        inventory: i === 3 && j === 0 ? 6 : r.int(40, 1800),
      })),
    };
  });
}

export function buildWorld(config: MockConfig, bootTime = Math.floor(Date.now() / 1000)): World {
  const todayVn = vnDate(bootTime);
  const startTime = vnMidnight(todayVn) - config.historyDays * D;
  const shops: ShopW[] = SHOP_SPECS.map((s, idx) => ({
    idx, id: s.id, name: s.name, cipher: s.cipher, code: s.code, baseOrders: s.base * config.scale,
    products: buildProducts(idx, s.catalog, startTime, config.seed),
  }));
  const orders: OrderW[] = [];
  const ordersByShop: OrderW[][] = shops.map(() => []);
  const totalDays = config.historyDays + config.futureDays + 1;

  for (const shop of shops) {
    const spec = SHOP_SPECS[shop.idx];
    const r = rng(hashSeed(config.seed, "orders", shop.idx));
    const users: string[] = [];
    let userSeq = 0;
    let orderSeq = 0;
    const sellable = shop.products.filter((p) => p.weight > 0);
    for (let day = 0; day < totalDays; day++) {
      const dayStart = startTime + day * D;
      const ymd = vnDate(dayStart);
      const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay();
      let f = wd === 0 || wd === 6 ? 1.35 : 1;
      f *= EVENT_DAYS[ymd.slice(5)] ?? 1;
      if (ymd.endsWith("-25")) f *= 1.3;
      const n = Math.round(shop.baseOrders * f * (1 + day * 0.004) * r.between(0.85, 1.15));
      for (let k = 0; k < n; k++) {
        const hour = r.weighted(HOUR_WEIGHTS.map((_, i) => i), HOUR_WEIGHTS);
        const createTime = dayStart + hour * H + r.int(0, H - 1);
        orders.push(makeOrder(shop, spec.commission, sellable, createTime, r, users, () => `buyer_${shop.idx}_${++userSeq}`, ++orderSeq));
        ordersByShop[shop.idx].push(orders[orders.length - 1]);
      }
    }
  }
  orders.sort((a, b) => a.createTime - b.createTime);
  for (const list of ordersByShop) list.sort((a, b) => a.createTime - b.createTime);
  const world: World = {
    config, startTime, bootTime, shops, orders, ordersByShop,
    orderById: new Map(orders.map((o) => [o.id, o])),
    clockOffsetSec: 0,
    now() { return Math.floor(Date.now() / 1000) + this.clockOffsetSec; },
  };
  return world;
}

function makeOrder(
  shop: ShopW, commissionRate: number, products: ProductW[], createTime: number, r: ReturnType<typeof rng>,
  users: string[], newUser: () => string, seq: number,
): OrderW {
  const id = `57${shop.idx + 7}${String(createTime).slice(-6)}${String(seq).padStart(7, "0")}`;
  let userId: string;
  if (users.length > 50 && r.chance(0.3)) userId = r.pick(users);
  else { userId = newUser(); users.push(userId); }

  const units: UnitW[] = [];
  const kinds = r.weighted([1, 2, 3], [70, 24, 6]);
  const sellerVoucher = r.chance(0.4) ? r.between(0.05, 0.15) : 0;
  const platformVoucher = r.chance(0.3) ? r.between(0.03, 0.1) : 0;
  const seen = new Set<string>();
  for (let i = 0; i < kinds; i++) {
    const p = r.weighted(products, products.map((x) => x.weight));
    const s = r.pick(p.skus);
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const qty = r.weighted([1, 2, 3], [85, 12, 3]);
    for (let q = 0; q < qty; q++) {
      units.push({
        lineId: `${id}${String(units.length + 1).padStart(2, "0")}`,
        productId: p.id, productName: p.title, skuId: s.id, skuName: s.name, sellerSku: s.sellerSku, image: p.image,
        original: s.price,
        sellerDiscount: Math.round((s.price * sellerVoucher) / 1000) * 1000,
        platformDiscount: Math.round((s.price * platformVoucher) / 1000) * 1000,
      });
    }
  }
  const shippingFee = r.pick([15_000, 18_000, 22_000, 25_000, 30_000, 35_000]);
  const shippingPlatformDiscount = r.chance(0.5) ? Math.min(shippingFee, r.pick([10_000, 15_000, 20_000, 35_000])) : 0;
  const isCod = r.chance(0.65);
  const province = r.weighted(PROVINCES.map((p) => p[0]), PROVINCES.map((p) => p[1]));
  const o: OrderW = {
    id, shopIdx: shop.idx, userId, createTime, events: [[createTime, "UNPAID"]], units, shippingFee, shippingPlatformDiscount,
    isCod, carrier: r.pick(CARRIERS), tracking: `VN${String(createTime).slice(-8)}${String(seq).padStart(5, "0")}`, province,
  };

  if (r.chance(0.03)) {
    o.cancelTime = createTime + D;
    o.cancelReason = "Đơn chưa thanh toán đã tự huỷ";
    o.cancelInitiator = "SYSTEM";
    o.events.push([o.cancelTime, "CANCELLED"]);
    return o;
  }
  o.paidTime = createTime + (isCod ? 30 : r.int(60, 600));
  o.events.push([o.paidTime, "AWAITING_SHIPMENT"]);
  if (r.chance(0.055)) {
    o.cancelTime = o.paidTime + r.int(0.2 * H, 12 * H);
    o.cancelReason = r.pick(CANCEL_REASONS.slice(0, 4));
    o.cancelInitiator = r.chance(0.8) ? "BUYER" : "SELLER";
    o.events.push([o.cancelTime, "CANCELLED"]);
    return o;
  }
  o.rtsTime = o.paidTime + r.int(4 * H, 30 * H);
  o.events.push([o.rtsTime, "AWAITING_COLLECTION"]);
  o.collectionTime = o.rtsTime + r.int(2 * H, 10 * H);
  o.events.push([o.collectionTime, "IN_TRANSIT"]);
  if (r.chance(isCod ? 0.03 : 0.006)) {
    o.cancelTime = o.collectionTime + r.int(2 * D, 4 * D);
    o.cancelReason = "Giao hàng thất bại";
    o.cancelInitiator = "SYSTEM";
    o.events.push([o.cancelTime, "CANCELLED"]);
    return o;
  }
  o.deliveryTime = o.collectionTime + r.int(1 * D, 4 * D);
  o.events.push([o.deliveryTime, "DELIVERED"]);
  o.completeTime = o.deliveryTime + r.int(5 * D, 8 * D);
  o.events.push([o.completeTime, "COMPLETED"]);

  let closeTime = o.completeTime;
  if (r.chance(0.05)) {
    const type = r.weighted(["REFUND", "RETURN_AND_REFUND", "REPLACEMENT"] as const, [40, 55, 5]);
    const c = o.deliveryTime + r.int(0.5 * D, 4 * D);
    const partial = units.length > 1 && r.chance(0.3);
    const unitIdx = partial ? [0] : units.map((_, i) => i);
    const paidForUnits = unitIdx.reduce((s, i) => s + units[i].original - units[i].sellerDiscount - units[i].platformDiscount, 0);
    const rejected = r.chance(0.12);
    const timeline: [string, number][] = [["RETURN_OR_REFUND_REQUEST_PENDING", c]];
    let t = c;
    if (rejected) timeline.push(["REFUND_OR_RETURN_REQUEST_REJECT", (t += r.int(0.5 * D, 2 * D))]);
    else if (type === "REFUND") {
      timeline.push(["RETURN_OR_REFUND_REQUEST_SUCCESS", (t += r.int(0.2 * D, 1 * D))]);
      timeline.push(["RETURN_OR_REFUND_REQUEST_COMPLETE", (t += D)]);
    } else {
      timeline.push(["AWAITING_BUYER_SHIP", (t += r.int(0.1 * D, 1 * D))]);
      timeline.push(["BUYER_SHIPPED_ITEM", (t += r.int(0.5 * D, 2 * D))]);
      timeline.push(["RETURN_OR_REFUND_REQUEST_SUCCESS", (t += r.int(1.5 * D, 3 * D))]);
      timeline.push(["RETURN_OR_REFUND_REQUEST_COMPLETE", (t += D)]);
    }
    o.ret = {
      id: `41${String(c).slice(-6)}${o.id.slice(-7)}`,
      type, createTime: c, reason: r.pick(RETURN_REASONS), timeline,
      refundTotal: rejected || type === "REPLACEMENT" ? 0 : paidForUnits + (partial ? 0 : o.shippingFee - o.shippingPlatformDiscount),
      unitIdx, returnShipping: type === "RETURN_AND_REFUND" && !rejected ? r.int(18, 28) * 1000 : 0,
    };
    closeTime = Math.max(closeTime, t);
  }

  o.settleTime = closeTime + r.int(1 * D, 3 * D);
  const refundedNet = o.ret && o.ret.refundTotal > 0 ? o.ret.unitIdx.reduce((s, i) => s + units[i].original - units[i].sellerDiscount, 0) : 0;
  const revenue = units.reduce((s, u) => s + u.original - u.sellerDiscount, 0) - refundedNet;
  const buyerPaid = units.reduce((s, u) => s + u.original - u.sellerDiscount - u.platformDiscount, 0) + shippingFee - shippingPlatformDiscount;
  const kept = revenue > 0;
  const fees: FeesW = {
    revenue,
    commission: kept ? Math.round(revenue * commissionRate) : 0,
    transaction: kept ? Math.round(buyerPaid * 0.04 * (revenue / (revenue + refundedNet))) : 0,
    affiliate: kept && r.chance(0.25) ? Math.round(revenue * r.between(0.1, 0.15)) : 0,
    infrastructure: kept ? 3000 : 0,
    shippingCost: r.int(0, 12) * 1000,
    tax: kept ? Math.round(revenue * 0.015) : 0,
    returnShipping: o.ret?.returnShipping ?? 0,
    settlement: 0,
  };
  fees.settlement = fees.revenue - fees.commission - fees.transaction - fees.affiliate - fees.infrastructure - fees.shippingCost - fees.tax - fees.returnShipping;
  o.fees = fees;
  o.events.sort((a, b) => a[0] - b[0]);
  return o;
}

// ───── state at "now" ─────
export function orderStatus(o: OrderW, now: number): { status: string; updateTime: number } {
  let status = "UNPAID";
  let updateTime = o.createTime;
  for (const [t, s] of o.events) if (t <= now) { status = s; updateTime = t; }
  return { status, updateTime };
}

export function returnState(ret: ReturnW, now: number): { status: string; updateTime: number } | null {
  if (ret.createTime > now) return null;
  let status = ret.timeline[0][0];
  let updateTime = ret.createTime;
  for (const [s, t] of ret.timeline) if (t <= now) { status = s; updateTime = t; }
  return { status, updateTime };
}

/** Monday 00:00 VN strictly after the settle time — when TikTok issues the statement. */
export function statementTimeFor(settleTime: number): number {
  const ymd = vnDate(settleTime);
  const wd = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  const daysToMonday = ((8 - wd) % 7) || 7;
  return vnMidnight(ymd) + daysToMonday * D;
}

export function statementId(shopIdx: number, statementTime: number): string {
  return `${7400 + shopIdx}${vnDate(statementTime).replace(/-/g, "")}`;
}
