import { createHmac, timingSafeEqual } from "crypto";

const EXCLUDED = new Set(["sign", "access_token"]);

export interface SignInput {
  path: string;                         // e.g. "/order/202309/orders/search" (no base URL prefix)
  query: Record<string, string>;        // decoded values
  body?: string;                        // exact JSON string that is sent; omit for GET / multipart
  appSecret: string;
}

/** TikTok Shop request signature (docs/architecture/01 §3). */
export function signShopRequest({ path, query, body, appSecret }: SignInput): string {
  const keys = Object.keys(query).filter((k) => !EXCLUDED.has(k)).sort();
  let s = path;
  for (const k of keys) s += k + query[k];
  if (body) s += body;
  s = appSecret + s + appSecret;
  return createHmac("sha256", appSecret).update(s).digest("hex");
}

/** Webhook `Authorization` header: hex(HMAC_SHA256(app_secret, app_key + raw_body)) (01 §11). */
export function signWebhook(appKey: string, appSecret: string, rawBody: string): string {
  return createHmac("sha256", appSecret).update(appKey + rawBody).digest("hex");
}

export function verifyWebhookSignature(appKey: string, appSecret: string, rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  const expected = Buffer.from(signWebhook(appKey, appSecret, rawBody), "utf8");
  const got = Buffer.from(header.trim(), "utf8");
  return expected.length === got.length && timingSafeEqual(expected, got);
}
