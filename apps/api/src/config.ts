import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DEMO_MODE: z.string().default("false"),
  SESSION_DAYS: z.coerce.number().default(30),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SYNC_WORKER: z.string().default("true"),
  BACKFILL_DAYS: z.coerce.number().default(30),
  APP_URL: z.string().default("http://localhost:3000"),
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),

  TIKTOK_SHOP_BASE_URL: z.string().default("https://open-api.tiktokglobalshop.com"),
  TIKTOK_AUTH_BASE_URL: z.string().default("https://auth.tiktok-shops.com"),
  TIKTOK_SHOP_AUTHORIZE_URL: z.string().default("https://services.tiktokshop.com/open/authorize"),
  TIKTOK_SHOP_SERVICE_ID: z.string().default(""),
  TIKTOK_APP_KEY: z.string().default(""),
  TIKTOK_APP_SECRET: z.string().default(""),
  TIKTOK_SHOP_RPS: z.coerce.number().default(5),

  TIKTOK_ADS_BASE_URL: z.string().default("https://business-api.tiktok.com/open_api/v1.3"),
  TIKTOK_ADS_AUTHORIZE_URL: z.string().default("https://business-api.tiktok.com/portal/auth"),
  TIKTOK_ADS_APP_ID: z.string().default(""),
  TIKTOK_ADS_APP_SECRET: z.string().default(""),
  TIKTOK_ADS_REDIRECT_URI: z.string().default("http://localhost:4000/api/connections/ads/callback"),
  TIKTOK_ADS_RPS: z.coerce.number().default(10),

  ENCRYPTION_KEY: z.string().default(""),
  STATE_JWT_SECRET: z.string().default(""),
  PII_SALT: z.string().default(""),

  PNL_OPEN_WINDOW_DAYS: z.coerce.number().default(45),
  SENDGRID_API_KEY: z.string().default(""),
  SENDGRID_FROM_EMAIL: z.string().default("noreply@ecomdash.vn"),
  TELEGRAM_BOT_TOKEN: z.string().default(""),
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | undefined;

export function config(): AppConfig {
  if (cached) return cached;
  const c = schema.parse(process.env);
  if (c.DEMO_MODE === "true" && c.NODE_ENV === "production") throw new Error("DEMO_MODE=true is not allowed when NODE_ENV=production");
  if (c.DEMO_MODE === "true") {
    c.ENCRYPTION_KEY ||= "ZGVtby1rZXktMzItYnl0ZXMtZm9yLWVjb21kYXNoISE=";
    c.STATE_JWT_SECRET ||= "demo-state-secret";
    c.PII_SALT ||= "demo-pii-salt";
  }
  for (const k of ["ENCRYPTION_KEY", "STATE_JWT_SECRET", "PII_SALT"] as const) if (!c[k]) throw new Error(`${k} must be set`);
  cached = c;
  return c;
}
