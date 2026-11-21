import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createHmac, randomBytes } from "crypto";
import { signShopRequest } from "@ecomdash/tiktok-client";
import { ADS_PRINCIPALS, advertisersFor, AdvertiserW, buildAdvertisers, campaignDay, CampaignW } from "./ads";
import { hashSeed, rng } from "./rng";
import {
  orderStatus, OrderW, returnState, SellerId, SELLERS, ShopW, statementId, statementTimeFor, vnDate, vnMidnight, World,
} from "./world";

type Q = Record<string, string | undefined>;
const rid = () => `2026${randomBytes(8).toString("hex")}`;
const okBody = (data: unknown) => ({ code: 0, message: "Success", request_id: rid(), data });
const errBody = (code: number, message: string) => ({ code, message, request_id: rid(), data: null });
const tok = (prefix: string) => `${prefix}${randomBytes(18).toString("base64url")}`;
const S = (n: number) => String(Math.round(n));

function paginate<T>(list: T[], pageSize: number, pageToken?: string) {
  const offset = pageToken ? Number(Buffer.from(pageToken, "base64url").toString()) || 0 : 0;
  const items = list.slice(offset, offset + pageSize);
  const next = offset + pageSize < list.length ? Buffer.from(String(offset + pageSize)).toString("base64url") : "";
  return { items, next, total: list.length };
}

export interface MockState {
  authCodes: Map<string, { kind: "shop" | "ads"; expiresAt: number; principal: string }>;
  shopTokens: Map<string, number>;   // access token → expiresAt (unix s)
  refreshTokens: Map<string, number>;
  adsTokens: Set<string>;
  webhooks: Map<string, string>;     // event_type → address
}

export function buildApp(world: World): { app: FastifyInstance; state: MockState } {
  const cfg = world.config;
  const advertisers = buildAdvertisers(world);
  const state: MockState = { authCodes: new Map(), shopTokens: new Map(), refreshTokens: new Map(), adsTokens: new Set(), webhooks: new Map() };
  const app = Fastify({ logger: false });
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => done(null, body));
  app.register(require("@fastify/formbody"));

  const realNow = () => Math.floor(Date.now() / 1000);
  // Tokens are self-validating (HMAC) so they survive a mock restart, like real TikTok tokens do.
  const tokKey = `${cfg.appSecret}|${cfg.adsSecret}|${cfg.seed}`;
  const signedTok = (prefix: string, kind: string, exp: number, principal: string) => {
    const body = Buffer.from(JSON.stringify({ k: kind, e: exp, p: principal, n: randomBytes(6).toString("hex") })).toString("base64url");
    return `${prefix}${body}.${createHmac("sha256", tokKey).update(body).digest("base64url").slice(0, 22)}`;
  };
  /** Token → { exp, principal } (seller id for shop tokens, BC/seller for ads tokens). Old tokens without a principal belong to Hoa Sen. */
  const readTokFull = (tok: string | undefined, kind: string): { e: number; p: string } | undefined => {
    const rest = tok?.replace(/^(ROW_AT_|ROW_RT_|act\.)/, "") ?? "";
    const dot = rest.lastIndexOf(".");
    const body = rest.slice(0, dot), mac = rest.slice(dot + 1);
    if (dot < 1 || createHmac("sha256", tokKey).update(body).digest("base64url").slice(0, 22) !== mac) return undefined;
    try { const p = JSON.parse(Buffer.from(body, "base64url").toString()); return p.k === kind ? { e: p.e, p: p.p ?? "hoasen" } : undefined; } catch { return undefined; }
  };
  const readTok = (tok: string | undefined, kind: string) => readTokFull(tok, kind)?.e;
  const shopTokenExp = (t?: string) => (t && state.shopTokens.has(t) ? state.shopTokens.get(t) : readTok(t, "sa"));
  const issueCode = (kind: "shop" | "ads", principal = "hoasen") => {
    const code = tok(kind === "shop" ? "TTP_" : "ADS_");
    state.authCodes.set(code, { kind, expiresAt: realNow() + 1800, principal });
    return code;
  };
  const shopByCipher = (c?: string) => world.shops.find((s) => s.cipher === c);
  const json = (s: unknown) => (typeof s === "string" && s ? JSON.parse(s) : {});

  // ───── shop-side view of ads (12 §4): GMV Max spend/revenue per shop-day, as the Ads API reports it ─────
  const gmvMaxDay = (shopIdx: number, ymd: string) => {
    let spend = 0, revenue = 0;
    for (const a of advertisers) for (const st of a.stores.filter((x) => x.shopIdx === shopIdx)) {
      for (const c of a.campaigns.filter((x) => x.kind === "GMV_MAX" && x.storeId === st.storeId)) {
        const d = campaignDay(world, c, ymd);
        if (d) { spend += d.spend; revenue += d.revenue; }
      }
    }
    return { spend, revenue };
  };
  /** Thời Trang Mây pays GMV Max from its payouts: each settled order carries its share of that day's GMV Max cost. */
  const AUTO_PAY_SHOPS = new Set([2]);
  /** Hoa Sen Beauty tops up ads from its shop balance: one GMV_PAYMENT_FOR_ADS adjustment per statement. */
  const BALANCE_PAY_SHOPS = new Set([0]);
  const dayRevenue = new Map<string, number>();
  const gmvMaxFee = (o: OrderW): number => {
    if (!AUTO_PAY_SHOPS.has(o.shopIdx) || !o.fees || o.fees.revenue <= 0) return 0;
    const ymd = vnDate(o.createTime);
    const key = `${o.shopIdx}|${ymd}`;
    if (!dayRevenue.has(key)) {
      dayRevenue.set(key, world.ordersByShop[o.shopIdx].filter((x) => x.fees && x.fees.revenue > 0 && vnDate(x.createTime) === ymd).reduce((t, x) => t + x.fees!.revenue, 0));
    }
    const total = dayRevenue.get(key)!;
    return total > 0 ? Math.round(gmvMaxDay(o.shopIdx, ymd).spend * (o.fees.revenue / total)) : 0;
  };
  const balanceAdjustment = (shopIdx: number, statementTime: number) => {
    if (!BALANCE_PAY_SHOPS.has(shopIdx)) return 0;
    let total = 0;
    for (let d = 1; d <= 7; d++) total += gmvMaxDay(shopIdx, vnDate(statementTime - d * 86_400)).spend;
    return Math.round(total * 0.4); // the rest is paid by card
  };

  // ───────────── Shop Open API: signature, token, cipher checks (01 §3–4) ─────────────
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const url = req.url.split("?")[0];
    if (!url.startsWith("/shop/")) return;
    const apiPath = url.slice("/shop".length);
    const q = req.query as Q;
    if (q.app_key !== cfg.appKey) return reply.send(errBody(36009004, "Invalid app_key"));
    const ts = Number(q.timestamp);
    const now = realNow();
    if (!ts || ts < now - 300 || ts > now + 30) return reply.send(errBody(36009004, "Invalid timestamp"));
    const raw = typeof req.body === "string" ? req.body : undefined;
    const expected = signShopRequest({ path: apiPath, query: q as Record<string, string>, body: raw || undefined, appSecret: cfg.appSecret });
    if (q.sign !== expected) return reply.send(errBody(106001, "Invalid signature"));
    const token = req.headers["x-tts-access-token"] as string | undefined;
    const exp = shopTokenExp(token);
    if (exp === undefined) return reply.send(errBody(36009004, "Invalid access token"));
    if (exp < now) return reply.send(errBody(105002, "Access token is expired"));
    const seller = readTokFull(token, "sa")?.p ?? "hoasen";
    (req as FastifyRequest & { seller?: string }).seller = seller;
    if (apiPath.startsWith("/authorization/")) {
      if (q.shop_cipher) return reply.send(errBody(36009004, "shop_cipher is not expected"));
    } else {
      if (!q.shop_cipher) return reply.send(errBody(106013, "Missing shop_cipher"));
      const shop = shopByCipher(q.shop_cipher);
      if (!shop || shop.seller !== seller) return reply.send(errBody(101000, "shop_cipher does not belong to this token"));
    }
    if (cfg.faultRate > 0 && Math.random() < cfg.faultRate) return reply.send(errBody(36009002, "Too many requests"));
  });

  const shopOf = (req: FastifyRequest) => shopByCipher((req.query as Q).shop_cipher)!;
  const visible = (shop: ShopW) => world.ordersByShop[shop.idx].filter((o) => o.createTime <= world.now());

  app.get("/shop/authorization/202309/shops", async (req) => okBody({
    shops: world.shops.filter((s) => s.seller === (req as FastifyRequest & { seller?: string }).seller).map((s) => ({ id: s.id, name: s.name, region: "VN", seller_type: "LOCAL", cipher: s.cipher, code: s.code })),
  }));

  app.post("/shop/order/202309/orders/search", async (req) => {
    const q = req.query as Q;
    const b = json(req.body);
    const now = world.now();
    let list = visible(shopOf(req)).map((o) => ({ o, st: orderStatus(o, now) }));
    if (b.order_status) list = list.filter((x) => x.st.status === b.order_status);
    if (b.create_time_ge) list = list.filter((x) => x.o.createTime >= b.create_time_ge);
    if (b.create_time_lt) list = list.filter((x) => x.o.createTime < b.create_time_lt);
    if (b.update_time_ge) list = list.filter((x) => x.st.updateTime >= b.update_time_ge);
    if (b.update_time_lt) list = list.filter((x) => x.st.updateTime < b.update_time_lt);
    const field = q.sort_field === "update_time" ? "u" : "c";
    const dir = q.sort_order === "ASC" ? 1 : -1;
    list.sort((a, b2) => dir * ((field === "u" ? a.st.updateTime - b2.st.updateTime : a.o.createTime - b2.o.createTime) || a.o.id.localeCompare(b2.o.id)));
    const size = Math.min(100, Math.max(1, Number(q.page_size) || 20));
    const p = paginate(list, size, q.page_token);
    return okBody({ orders: p.items.map((x) => orderWire(x.o, now)), next_page_token: p.next, total_count: p.total });
  });

  app.get("/shop/order/202309/orders", async (req) => {
    const ids = ((req.query as Q).ids ?? "").split(",").filter(Boolean).slice(0, 50);
    const shop = shopOf(req);
    const now = world.now();
    return okBody({ orders: ids.map((id) => world.orderById.get(id)).filter((o): o is OrderW => !!o && o.shopIdx === shop.idx && o.createTime <= now).map((o) => orderWire(o, now)) });
  });

  app.post("/shop/product/202309/products/search", async (req) => {
    const q = req.query as Q;
    const b = json(req.body);
    let list = shopOf(req).products;
    if (b.status && b.status !== "ALL") list = list.filter((p) => p.status === b.status);
    if (b.update_time_ge) list = list.filter((p) => p.updateTime >= b.update_time_ge);
    if (b.update_time_le) list = list.filter((p) => p.updateTime <= b.update_time_le);
    const p = paginate(list, Math.min(100, Number(q.page_size) || 20), q.page_token);
    return okBody({
      products: p.items.map((x) => ({ id: x.id, title: x.title, status: x.status, create_time: x.createTime, update_time: x.updateTime, skus: x.skus.map(skuWire) })),
      next_page_token: p.next, total_count: p.total,
    });
  });

  app.get("/shop/product/202309/products/:id", async (req, reply) => {
    const p = shopOf(req).products.find((x) => x.id === (req.params as { id: string }).id);
    if (!p) return reply.send(errBody(12052700, "Product not found"));
    return okBody({
      id: p.id, title: p.title, status: p.status, create_time: p.createTime, update_time: p.updateTime,
      main_images: [{ uri: `tos-alisg-i-${p.id}`, urls: [p.image] }],
      category_chains: [{ id: "601450", local_name: "Làm đẹp", is_leaf: false }, { id: String(hashSeed(p.category) % 1e6), local_name: p.category, is_leaf: true }],
      skus: p.skus.map(skuWire),
    });
  });

  app.get("/shop/finance/202309/statements", async (req) => {
    const q = req.query as Q;
    const shop = shopOf(req);
    const now = world.now();
    const groups = new Map<number, OrderW[]>();
    for (const o of world.ordersByShop[shop.idx]) {
      if (!o.fees || !o.settleTime || o.settleTime > now) continue;
      const st = statementTimeFor(o.settleTime);
      if (!groups.has(st)) groups.set(st, []);
      groups.get(st)!.push(o);
    }
    let list = [...groups.entries()].map(([st, os]) => {
      const sum = (f: (o: OrderW) => number) => os.reduce((s, o) => s + f(o), 0);
      const fee = sum((o) => o.fees!.commission + o.fees!.transaction + o.fees!.affiliate + o.fees!.infrastructure + o.fees!.tax);
      const ship = sum((o) => o.fees!.shippingCost + o.fees!.returnShipping);
      const revenue = sum((o) => o.fees!.revenue);
      return {
        id: statementId(shop.idx, st), statement_time: st, currency: "VND",
        revenue_amount: S(revenue), fee_amount: S(-fee - sum(gmvMaxFee)), adjustment_amount: S(-balanceAdjustment(shop.idx, st)), shipping_cost_amount: S(-ship),
        net_sales_amount: S(revenue), settlement_amount: S(sum((o) => o.fees!.settlement - gmvMaxFee(o)) - balanceAdjustment(shop.idx, st)),
        payment_status: st + 86_400 <= now ? "PAID" : "PROCESSING", payment_id: st + 86_400 <= now ? `PAY${statementId(shop.idx, st)}` : undefined,
      };
    });
    if (q.statement_time_ge) list = list.filter((s) => s.statement_time >= Number(q.statement_time_ge));
    if (q.statement_time_lt) list = list.filter((s) => s.statement_time < Number(q.statement_time_lt));
    if (q.payment_status) list = list.filter((s) => s.payment_status === q.payment_status);
    list.sort((a, b) => (q.sort_order === "ASC" ? a.statement_time - b.statement_time : b.statement_time - a.statement_time));
    const p = paginate(list, Number(q.page_size) || 20, q.page_token);
    return okBody({ statements: p.items, next_page_token: p.next });
  });

  app.get("/shop/finance/202501/statements/:sid/statement_transactions", async (req) => {
    const q = req.query as Q;
    const sid = (req.params as { sid: string }).sid;
    const shop = shopOf(req);
    const now = world.now();
    const list = world.ordersByShop[shop.idx].filter((o) => o.fees && o.settleTime && o.settleTime <= now && statementId(o.shopIdx, statementTimeFor(o.settleTime)) === sid);
    const p = paginate(list, Math.min(100, Number(q.page_size) || 20), q.page_token);
    const adj = balanceAdjustment(shop.idx, Number(sid.slice(4)) ? stTimeOf(sid) : 0);
    const extra = !q.page_token && adj > 0 ? [{ type: "ADJUSTMENT", adjustment_id: `ADJ${sid}`, adjustment_type: "GMV_PAYMENT_FOR_ADS", settlement_amount: S(-adj), currency: "VND" }] : [];
    return okBody({ statement_transactions: [...extra, ...p.items.map((o) => ({ type: "ORDER", order_id: o.id, ...settlementTx(o) }))], next_page_token: p.next, total_count: p.total + extra.length });
  });

  app.get("/shop/finance/202501/orders/:id/statement_transactions", async (req) => {
    const id = (req.params as { id: string }).id;
    const o = world.orderById.get(id);
    const now = world.now();
    if (!o || o.shopIdx !== shopOf(req).idx || !o.fees || !o.settleTime || o.settleTime > now) return okBody({ order_id: id, statement_transactions: [] });
    return okBody({ order_id: id, statement_transactions: [settlementTx(o)] });
  });

  function stTimeOf(sid: string) {
    const d = sid.slice(4);
    return vnMidnight(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`);
  }

  function settlementTx(o: OrderW) {
    const f = o.fees!;
    const adFee = gmvMaxFee(o);
    const st = statementTimeFor(o.settleTime!);
    const sub = o.units.reduce((s, u) => s + u.original, 0);
    const sellerD = o.units.reduce((s, u) => s + u.sellerDiscount, 0);
    return {
        statement_id: statementId(o.shopIdx, st), statement_time: st, currency: "VND",
        revenue_amount: S(f.revenue), fee_tax_amount: S(-(f.commission + f.transaction + f.affiliate + f.infrastructure + f.tax + adFee)),
        shipping_cost_amount: S(-(f.shippingCost + f.returnShipping)), settlement_amount: S(f.settlement - adFee),
        ...(adFee ? { gmv_max_ad_fee_amount: S(-adFee) } : {}),
        sku_transactions: [{
          sku_id: o.units[0].skuId,
          revenue_breakdown: { subtotal_before_discount_amount: S(sub), seller_discount_amount: S(-sellerD), refund_subtotal_after_seller_discounts_amount: S(-(sub - sellerD - f.revenue)) },
          shipping_cost_breakdown: { actual_shipping_fee_amount: S(-f.shippingCost), return_shipping_fee_amount: S(-f.returnShipping) },
          fee_tax_breakdown: {
            fee: {
              platform_commission_amount: S(-f.commission), transaction_fee_amount: S(-f.transaction), affiliate_commission_amount: S(-f.affiliate), vn_fix_infrastructure_fee_amount: S(-f.infrastructure),
              ...(adFee ? { gmv_max_ad_fee_amount: S(-adFee) } : {}),
            },
            tax: { vat_amount: S(-f.tax) },
          },
        }],
      };
  }

  app.post("/shop/return_refund/202309/returns/search", async (req) => {
    const q = req.query as Q;
    const b = json(req.body);
    const now = world.now();
    let list = world.ordersByShop[shopOf(req).idx]
      .filter((o) => o.ret && o.ret.createTime <= now)
      .map((o) => ({ o, st: returnState(o.ret!, now)! }));
    if (b.update_time_ge) list = list.filter((x) => x.st.updateTime >= b.update_time_ge);
    if (b.update_time_lt) list = list.filter((x) => x.st.updateTime < b.update_time_lt);
    if (b.order_ids?.length) list = list.filter((x) => b.order_ids.includes(x.o.id));
    list.sort((a, c) => a.st.updateTime - c.st.updateTime);
    const p = paginate(list, Math.min(50, Number(q.page_size) || 10), q.page_token);
    return okBody({
      return_orders: p.items.map(({ o, st }) => ({
        return_id: o.ret!.id, order_id: o.id, return_type: o.ret!.type, return_status: st.status, return_reason_text: o.ret!.reason,
        refund_amount: { currency: "VND", refund_total: S(o.ret!.refundTotal) },
        return_line_items: o.ret!.unitIdx.map((i) => ({ return_line_item_id: `${o.ret!.id}${i}`, order_line_item_id: o.units[i].lineId, sku_id: o.units[i].skuId, product_name: o.units[i].productName })),
        create_time: o.ret!.createTime, update_time: st.updateTime,
      })),
      next_page_token: p.next, total_count: p.total,
    });
  });

  app.post("/shop/return_refund/202309/cancellations/search", async (req) => {
    const q = req.query as Q;
    const b = json(req.body);
    const now = world.now();
    let list = world.ordersByShop[shopOf(req).idx].filter((o) => o.cancelTime && o.cancelTime <= now && o.paidTime);
    if (b.update_time_ge) list = list.filter((o) => o.cancelTime! >= b.update_time_ge);
    if (b.update_time_lt) list = list.filter((o) => o.cancelTime! < b.update_time_lt);
    list.sort((a, c) => a.cancelTime! - c.cancelTime!);
    const p = paginate(list, Math.min(50, Number(q.page_size) || 10), q.page_token);
    return okBody({
      cancellations: p.items.map((o) => ({
        cancel_id: `C${o.id}`, order_id: o.id, cancel_type: o.cancelInitiator === "BUYER" ? "BUYER_CANCEL" : "CANCEL",
        cancel_status: "CANCELLATION_REQUEST_COMPLETE", cancel_reason_text: o.cancelReason,
        refund_amount: { currency: "VND", refund_total: S(buyerPaid(o)) }, create_time: o.cancelTime, update_time: o.cancelTime,
      })),
      next_page_token: p.next, total_count: p.total,
    });
  });

  const shopPerformance = async (req: FastifyRequest) => {
    const q = req.query as Q;
    const shop = shopOf(req);
    const intervals = [];
    for (let d = q.start_date_ge!; d < q.end_date_lt!; d = vnDate(vnMidnight(d) + 86_400 + 3600)) {
      const from = vnMidnight(d), to = from + 86_400;
      const os = world.ordersByShop[shop.idx].filter((o) => o.paidTime && o.createTime >= from && o.createTime < to && o.createTime <= world.now());
      const r = rng(hashSeed(world.config.seed, "pv", shop.idx, d));
      const pv = Math.round(os.length * r.between(35, 60));
      intervals.push({
        start_date: d, end_date: vnDate(to + 3600),
        gmv: { amount: S(os.reduce((s, o) => s + buyerPaid(o), 0)), currency: "VND" },
        orders: os.length, units_sold: os.reduce((s, o) => s + o.units.length, 0), buyers: new Set(os.map((o) => o.userId)).size,
        product_page_views: pv, avg_product_page_visitors: Math.round(pv * 0.6), product_impressions: pv * 9,
        gmv_breakdowns: (() => {
          const gmv = os.reduce((s, o) => s + buyerPaid(o), 0);
          const viaGmvMax = Math.min(gmv, gmvMaxDay(shop.idx, d).revenue);
          return [{ type: "GMV_MAX", amount: S(viaGmvMax) }, { type: "NON_GMV_MAX", amount: S(gmv - viaGmvMax) }];
        })(),
      });
    }
    return okBody({ performance: { intervals } });
  };
  app.get("/shop/analytics/202405/shop/performance", shopPerformance);
  app.get("/shop/analytics/202509/shop/performance", shopPerformance);

  app.get("/shop/analytics/202405/shop_products/performance", async (req) => {
    const q = req.query as Q;
    const shop = shopOf(req);
    const from = vnMidnight(q.start_date_ge!), to = vnMidnight(q.end_date_lt!);
    const agg = new Map<string, { gmv: number; orders: Set<string>; units: number }>();
    for (const o of world.ordersByShop[shop.idx]) {
      if (!o.paidTime || o.createTime < from || o.createTime >= to || o.createTime > world.now()) continue;
      for (const u of o.units) {
        const a = agg.get(u.productId) ?? { gmv: 0, orders: new Set(), units: 0 };
        a.gmv += u.original - u.sellerDiscount; a.orders.add(o.id); a.units++;
        agg.set(u.productId, a);
      }
    }
    const list = [...agg.entries()].map(([id, a]) => {
      const r = rng(hashSeed(world.config.seed, "ppv", id, q.start_date_ge!));
      const pv = Math.round(a.orders.size * r.between(28, 70));
      return { id, gmv: { amount: S(a.gmv), currency: "VND" }, orders: a.orders.size, units_sold: a.units, page_views: pv, impressions: pv * 8, click_through_rate: (r.between(0.02, 0.06)).toFixed(4) };
    });
    const p = paginate(list, Math.min(100, Number(q.page_size) || 20), q.page_token);
    return okBody({ shop_products: p.items, next_page_token: p.next });
  });

  app.get("/shop/event/202309/webhooks", async () => okBody({ webhooks: [...state.webhooks.entries()].map(([event_type, address]) => ({ event_type, address })) }));
  app.put("/shop/event/202309/webhooks", async (req) => {
    const b = json(req.body);
    state.webhooks.set(b.event_type, b.address);
    return okBody({});
  });

  // ───────────── Shop auth (unsigned) ─────────────
  // The seller picks which Seller Center account is signed in (the real page uses the browser's TikTok session).
  app.get("/shop-auth/open/authorize", async (req, reply) => {
    const q = req.query as Q;
    const back = (extra: string) => `${cfg.shopRedirectUri}?${extra}&state=${encodeURIComponent(q.state ?? "")}`;
    const accounts = SELLERS.map((x) => ({
      label: x.name, sub: world.shops.filter((sh) => sh.seller === x.id).map((sh) => sh.name).join(", "),
      approve: back(`code=${issueCode("shop", x.id)}`), id: x.id,
    }));
    reply.type("text/html").send(authorizePage("TikTok Shop Seller Center",
      ["Thông tin shop được uỷ quyền", "Đơn hàng", "Sản phẩm", "Tài chính", "Hoàn / huỷ", "Phân tích dữ liệu"],
      accounts, back("code=null&error=auth_denied"), q.seller));
  });

  const tokenResponse = (sellerId: string) => {
    const now = realNow();
    const seller = SELLERS.find((x) => x.id === sellerId) ?? SELLERS[0];
    const access = signedTok("ROW_AT_", "sa", now + cfg.accessTtlSec, seller.id);
    const refresh = signedTok("ROW_RT_", "sr", now + 365 * 86_400, seller.id);
    return {
      access_token: access, access_token_expire_in: now + cfg.accessTtlSec, refresh_token: refresh, refresh_token_expire_in: now + 365 * 86_400,
      open_id: seller.openId, seller_name: seller.name, seller_base_region: "VN", user_type: 0,
      granted_scopes: ["seller.authorization.info", "seller.order.info", "seller.product.basic", "seller.finance.info", "seller.return_refund.basic", "seller.data_analytics"],
    };
  };
  app.get("/shop-auth/api/v2/token/get", async (req) => {
    const q = req.query as Q;
    if (q.app_key !== cfg.appKey || q.app_secret !== cfg.appSecret) return errBody(36009004, "Invalid app credentials");
    const c = state.authCodes.get(q.auth_code ?? "");
    if (!c || c.kind !== "shop" || c.expiresAt < realNow()) return errBody(36004004, "Invalid auth code");
    state.authCodes.delete(q.auth_code!);
    return okBody(tokenResponse(c.principal));
  });
  app.get("/shop-auth/api/v2/token/refresh", async (req) => {
    const q = req.query as Q;
    if (q.app_key !== cfg.appKey || q.app_secret !== cfg.appSecret) return errBody(36009004, "Invalid app credentials");
    const rt = readTokFull(q.refresh_token, "sr");
    if (!rt || rt.e < realNow() || state.refreshTokens.has(q.refresh_token!)) return errBody(105002, "Refresh token is invalid or expired");
    state.refreshTokens.set(q.refresh_token!, 0); // single use
    return okBody(tokenResponse(rt.p));
  });

  // ───────────── Ads ─────────────
  app.get("/ads/portal/auth", async (req, reply) => {
    const q = req.query as Q;
    const back = (extra: string) => `${q.redirect_uri}?${extra}&state=${encodeURIComponent(q.state ?? "")}`;
    const accounts = ADS_PRINCIPALS.map((x) => {
      const code = issueCode("ads", x.id);
      return { id: x.id, label: x.label, sub: advertisersFor(advertisers, x.id).map((a) => a.name).join(", "), approve: back(`auth_code=${code}&code=${code}`) };
    });
    reply.type("text/html").send(authorizePage("TikTok for Business",
      ["Quản lý tài khoản quảng cáo (chỉ đọc)", "Báo cáo quảng cáo", "GMV Max", "Tài sản Business Center"],
      accounts, back("error=auth_denied"), q.account));
  });

  const ADS = "/ads/open_api/v1.3";
  const adsOk = (data: unknown) => okBody(data);
  const adsPrincipal = (req: FastifyRequest) => readTokFull(req.headers["access-token"] as string | undefined, "ads")?.p;
  const parseArr = (v?: string): string[] => { try { return v ? JSON.parse(v) : []; } catch { return []; } };
  /** Advertiser if the request's token may see it (seller's own accounts, or accounts shared with the DigiAds BC). */
  const visibleAdvs = (req: FastifyRequest): AdvertiserW[] => advertisersFor(advertisers, adsPrincipal(req) ?? "");
  const advById = (req: FastifyRequest, id?: string) => visibleAdvs(req).find((a) => a.id === id);

  app.post(`${ADS}/oauth2/access_token/`, async (req) => {
    const b = json(req.body);
    if (b.app_id !== cfg.adsAppId || b.secret !== cfg.adsSecret) return errBody(40001, "Invalid app credentials");
    const c = state.authCodes.get(b.auth_code ?? "");
    if (!c || c.kind !== "ads") return errBody(40002, "Invalid auth_code");
    state.authCodes.delete(b.auth_code);
    const t = signedTok("act.", "ads", 4_102_444_800, c.principal);
    return adsOk({ access_token: t, advertiser_ids: advertisersFor(advertisers, c.principal).map((a) => a.id), scope: [1, 2, 3, 4] });
  });

  app.addHook("preHandler", async (req, reply) => {
    const url = req.url.split("?")[0];
    if (!url.startsWith(`${ADS}/`) || url.startsWith(`${ADS}/oauth2/access_token`)) return;
    if (!adsPrincipal(req)) return reply.send(errBody(40105, "Access token is invalid"));
    if (cfg.faultRate > 0 && Math.random() < cfg.faultRate) return reply.send(errBody(40100, "Requests too frequent"));
  });

  app.get(`${ADS}/oauth2/advertiser/get/`, async (req) => {
    const q = req.query as Q;
    if (q.app_id !== cfg.adsAppId || q.secret !== cfg.adsSecret) return errBody(40001, "Invalid app credentials");
    return adsOk({ list: visibleAdvs(req).map((a) => ({ advertiser_id: a.id, advertiser_name: a.name })) });
  });

  app.get(`${ADS}/advertiser/info/`, async (req) => {
    const ids = parseArr((req.query as Q).advertiser_ids);
    return adsOk({ list: visibleAdvs(req).filter((a) => ids.includes(a.id)).map((a) => ({
      advertiser_id: a.id, name: a.name, currency: a.currency, timezone: a.timezone, display_timezone: a.timezone, status: "STATUS_ENABLE", owner_bc_id: a.bcId,
    })) });
  });

  const campaignWire = (c: CampaignW) => ({
    campaign_id: c.id, campaign_name: c.name, objective_type: "PRODUCT_SALES", campaign_type: c.kind === "GMV_MAX" ? "GMV_MAX" : "REGULAR_CAMPAIGN",
    budget: c.budget, budget_mode: c.budgetMode,
    operation_status: c.disabledLastDays || (c.activeTo && vnDate(world.now()) > c.activeTo) ? "DISABLE" : "ENABLE",
    secondary_status: "CAMPAIGN_STATUS_ENABLE",
  });

  app.get(`${ADS}/campaign/get/`, async (req) => {
    const q = req.query as Q;
    const a = advById(req, q.advertiser_id);
    if (!a) return errBody(40300, "No permission for this advertiser");
    const page = Number(q.page) || 1, size = Math.min(1000, Number(q.page_size) || 10);
    const list = a.campaigns.map(campaignWire);
    return adsOk({ list: list.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: list.length, total_page: Math.max(1, Math.ceil(list.length / size)) } });
  });

  app.get(`${ADS}/campaign/gmv_max/info/`, async (req) => {
    const q = req.query as Q;
    const c = advById(req, q.advertiser_id)?.campaigns.find((x) => x.id === q.campaign_id && x.kind === "GMV_MAX");
    if (!c) return errBody(40002, "Campaign is not a GMV Max campaign");
    return adsOk({ campaign_id: c.id, store_id: c.storeId, store_authorized_bc_id: "7300001111222233", shopping_ads_type: c.shoppingType, budget: c.budget, roas_bid: c.roasBid, operation_status: "ENABLE" });
  });

  app.get(`${ADS}/gmv_max/store/list/`, async (req) => {
    const a = advById(req, (req.query as Q).advertiser_id);
    if (!a) return errBody(40300, "No permission for this advertiser");
    return adsOk({ store_list: a.stores.map((s) => ({
      store_id: s.storeId, store_name: s.storeName, store_code: s.storeCode, store_status: "ACTIVE", store_authorized_bc_id: a.bcId,
      store_role: "AD_PROMOTION", is_owner_bc: true, is_gmv_max_available: s.gmvMax, targeting_region_codes: ["VN"],
    })) });
  });

  const reportRange = (q: Q) => {
    const days: string[] = [];
    for (let d = q.start_date!; d <= q.end_date!; d = vnDate(vnMidnight(d) + 86_400 + 3600)) days.push(d);
    return days;
  };

  app.get(`${ADS}/report/integrated/get/`, async (req) => {
    const q = req.query as Q;
    const a = advById(req, q.advertiser_id);
    if (!a) return errBody(40300, "No permission for this advertiser");
    const days = reportRange(q);
    if (days.length > 30) return errBody(40002, "The time range of stat_time_day cannot exceed 30 days");
    const metrics = parseArr(q.metrics);
    const rows = [];
    for (const c of a.campaigns.filter((x) => x.kind === "MANUAL")) for (const d of days) {
      const s = campaignDay(world, c, d);
      if (!s) continue;
      const all: Record<string, string> = {
        spend: S(s.spend), impressions: S(s.impressions), clicks: S(s.clicks), conversion: S(s.conversions), complete_payment: S(s.orders),
        total_complete_payment_rate: S(s.revenue), ctr: (s.clicks / Math.max(1, s.impressions) * 100).toFixed(2), cpc: S(s.spend / Math.max(1, s.clicks)),
        complete_payment_roas: (s.revenue / Math.max(1, s.spend)).toFixed(2),
      };
      rows.push({ dimensions: { campaign_id: c.id, stat_time_day: `${d} 00:00:00` }, metrics: Object.fromEntries(metrics.map((m) => [m, all[m] ?? "0"])) });
    }
    const page = Number(q.page) || 1, size = Math.min(1000, Number(q.page_size) || 10);
    return adsOk({ list: rows.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: rows.length, total_page: Math.max(1, Math.ceil(rows.length / size)) } });
  });

  app.get(`${ADS}/gmv_max/report/get/`, async (req) => {
    const q = req.query as Q;
    const a = advById(req, q.advertiser_id);
    if (!a) return errBody(40300, "No permission for this advertiser");
    const stores = parseArr(q.store_ids);
    if (stores.length !== 1) return errBody(40002, "store_ids must contain exactly 1 item");
    const days = reportRange(q);
    if (days.length > 30) return errBody(40002, "The time range cannot exceed 30 days");
    const metrics = parseArr(q.metrics);
    const rows = [];
    for (const c of a.campaigns.filter((x) => x.kind === "GMV_MAX" && x.storeId === stores[0])) for (const d of days) {
      const s = campaignDay(world, c, d);
      if (!s) continue;
      const all: Record<string, string> = {
        cost: S(s.spend), net_cost: S(s.spend * 0.98), orders: S(s.orders), cost_per_order: S(s.spend / Math.max(1, s.orders)),
        gross_revenue: S(s.revenue), roi: (s.revenue / Math.max(1, s.spend)).toFixed(2),
      };
      rows.push({ dimensions: { campaign_id: c.id, stat_time_day: `${d} 00:00:00` }, metrics: Object.fromEntries(metrics.map((m) => [m, all[m] ?? "0"])) });
    }
    const page = Number(q.page) || 1, size = Math.min(1000, Number(q.page_size) || 10);
    return adsOk({ list: rows.slice((page - 1) * size, page * size), page_info: { page, page_size: size, total_number: rows.length, total_page: Math.max(1, Math.ceil(rows.length / size)) } });
  });

  // ───────────── dev helpers ─────────────
  app.get("/__mock/health", async () => ({ ok: true, now: world.now(), clockOffsetSec: world.clockOffsetSec }));
  app.get("/__mock/auto-authorize", async (req) => {
    const q = req.query as Q;
    return { code: issueCode((q.kind as "shop" | "ads") ?? "shop", q.seller ?? q.account ?? "hoasen") };
  });
  /** Seller authorizes the app from the Seller Center App Store: callback without state (12 §3.2). */
  app.get("/__mock/app-store-authorize", async (req, reply) => {
    const seller = ((req.query as Q).seller ?? "may") as SellerId;
    const url = `${cfg.shopRedirectUri}?code=${issueCode("shop", seller)}`;
    if ((req.query as Q).follow === "0") return { url };
    return reply.redirect(url);
  });
  app.post("/__mock/tick", async (req) => {
    world.clockOffsetSec += (Number((req.query as Q).minutes) || 60) * 60;
    return { ok: true, clockOffsetSec: world.clockOffsetSec };
  });
  app.post("/__mock/reset", async () => { world.clockOffsetSec = 0; return { ok: true }; });
  app.post("/__mock/expire-token", async (req) => { state.shopTokens.set((req.query as Q).token ?? "", 0); return { ok: true }; });
  app.get("/__mock/state", async (req) => {
    const days = Number((req.query as Q).days) || 30;
    const now = world.now();
    const from = vnMidnight(vnDate(now)) - (days - 1) * 86_400;
    return {
      now, from,
      shops: world.shops.map((s) => {
        const os = world.ordersByShop[s.idx].filter((o) => o.createTime >= from && o.createTime <= now && o.paidTime);
        return {
          id: s.id, name: s.name, paidOrders: os.length,
          grossItemValue: os.reduce((x, o) => x + o.units.reduce((y, u) => y + u.original - u.sellerDiscount, 0), 0),
          cancelled: os.filter((o) => orderStatus(o, now).status === "CANCELLED").length,
        };
      }),
    };
  });

  return { app, state };
}

function skuWire(s: { id: string; sellerSku: string; name: string; price: number; inventory: number }) {
  return {
    id: s.id, seller_sku: s.sellerSku, price: { currency: "VND", sale_price: String(s.price), tax_exclusive_price: String(s.price) },
    list_price: { currency: "VND", amount: String(Math.round(s.price * 1.25 / 1000) * 1000) },
    inventory: [{ warehouse_id: "7300000000000000001", quantity: s.inventory }],
    sales_attributes: [{ name: "Phân loại", value_name: s.name }],
  };
}

export function buyerPaid(o: OrderW): number {
  return o.units.reduce((s, u) => s + u.original - u.sellerDiscount - u.platformDiscount, 0) + o.shippingFee - o.shippingPlatformDiscount;
}

export function orderWire(o: OrderW, now: number) {
  const { status, updateTime } = orderStatus(o, now);
  const at = (t?: number) => (t && t <= now ? t : undefined);
  const sum = (f: (u: OrderW["units"][number]) => number) => o.units.reduce((s, u) => s + f(u), 0);
  const original = sum((u) => u.original), sellerD = sum((u) => u.sellerDiscount), platformD = sum((u) => u.platformDiscount);
  return {
    id: o.id, status, create_time: o.createTime, update_time: updateTime,
    paid_time: at(o.paidTime), rts_time: at(o.rtsTime), collection_time: at(o.collectionTime), delivery_time: at(o.deliveryTime), cancel_time: at(o.cancelTime),
    cancel_reason: at(o.cancelTime) ? o.cancelReason : undefined, cancellation_initiator: at(o.cancelTime) ? o.cancelInitiator : undefined,
    user_id: o.userId,
    payment: {
      currency: "VND", sub_total: S(original - sellerD - platformD), shipping_fee: S(o.shippingFee - o.shippingPlatformDiscount),
      seller_discount: S(sellerD), platform_discount: S(platformD), total_amount: S(buyerPaid(o)), original_total_product_price: S(original),
      original_shipping_fee: S(o.shippingFee), shipping_fee_platform_discount: S(o.shippingPlatformDiscount), shipping_fee_seller_discount: "0", tax: "0",
    },
    recipient_address: {
      region_code: "VN", full_address: `*** ${o.province}`,
      district_info: [
        { address_level_name: "Country", address_name: "Việt Nam", address_level: "L0" },
        { address_level_name: "Province", address_name: o.province, address_level: "L1" },
      ],
    },
    line_items: o.units.map((u) => ({
      id: u.lineId, product_id: u.productId, product_name: u.productName, sku_id: u.skuId, sku_name: u.skuName, sku_image: u.image, seller_sku: u.sellerSku,
      original_price: S(u.original), sale_price: S(u.original - u.sellerDiscount), seller_discount: S(u.sellerDiscount), platform_discount: S(u.platformDiscount),
      currency: "VND", display_status: status, is_gift: false,
    })),
    shipping_provider: o.carrier, shipping_type: "TIKTOK", tracking_number: at(o.rtsTime) ? o.tracking : undefined, delivery_option_name: "Tiêu chuẩn",
    payment_method_name: o.isCod ? "Thanh toán khi nhận hàng" : "Ví ShopeePay / thẻ", is_cod: o.isCod, is_sample_order: false, is_replacement_order: false,
  };
}

function authorizePage(product: string, scopes: string[], accounts: { id: string; label: string; sub: string; approve: string }[], deny: string, preselect?: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Uỷ quyền EcomDash</title>
<style>body{font-family:system-ui,sans-serif;background:#f4f5f7;margin:0;padding:40px 16px;color:#161823}.c{max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
h1{font-size:19px;margin:0 0 4px}.m{color:#6b6f80;font-size:13px}ul{padding-left:18px;font-size:14px;line-height:1.8}.b{display:flex;gap:10px;margin-top:22px}
a{flex:1;text-align:center;padding:11px;border-radius:8px;text-decoration:none;font-weight:600}.y{background:#fe2c55;color:#fff}.n{background:#f1f1f2;color:#161823}.acc{display:flex;gap:10px;align-items:flex-start;border:1px solid #e3e4e8;border-radius:8px;padding:10px;margin:8px 0;font-size:14px;cursor:pointer}.acc small{color:#6b6f80}.tag{display:inline-block;background:#fff3cd;color:#7a5b00;font-size:11px;padding:2px 8px;border-radius:99px;margin-bottom:12px}</style></head>
<body><div class="c"><span class="tag">MOCK — không phải TikTok thật</span><h1>${esc(product)}</h1><p class="m">Ứng dụng <b>EcomDash</b> yêu cầu các quyền:</p>
<ul>${scopes.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><p class="m">Chọn tài khoản đang đăng nhập rồi bấm Đồng ý:</p>
${accounts.map((a, i) => `<label class="acc"><input type="radio" name="acc" value="${esc(a.approve)}" data-id="${esc(a.id)}" ${(preselect ? a.id === preselect : i === 0) ? "checked" : ""}><span><b>${esc(a.label)}</b><br><small>${esc(a.sub)}</small></span></label>`).join("")}
<div class="b"><a class="n" href="${esc(deny)}">Từ chối</a><a class="y" id="approve" href="#" onclick="location.href=document.querySelector('input[name=acc]:checked').value;return false">Đồng ý</a></div></div></body></html>`;
}
