const num = (v: string | undefined, d: number) => (v === undefined || v === "" ? d : Number(v));

export interface MockConfig {
  port: number;
  seed: number;
  historyDays: number;
  futureDays: number;
  appKey: string;
  appSecret: string;
  serviceId: string;
  adsAppId: string;
  adsSecret: string;
  accessTtlSec: number;
  shopRedirectUri: string;
  webhookUrl: string;
  webhookIntervalSec: number;
  faultRate: number;
  scale: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): MockConfig {
  return {
    port: num(env.MOCK_TIKTOK_PORT, 4010),
    seed: num(env.MOCK_SEED, 20261111),
    historyDays: num(env.MOCK_HISTORY_DAYS, 60),
    futureDays: 5,
    appKey: env.MOCK_APP_KEY ?? env.TIKTOK_APP_KEY ?? "mock_app_key",
    appSecret: env.MOCK_APP_SECRET ?? env.TIKTOK_APP_SECRET ?? "mock_app_secret",
    serviceId: env.TIKTOK_SHOP_SERVICE_ID ?? "mock_service",
    adsAppId: env.MOCK_ADS_APP_ID ?? env.TIKTOK_ADS_APP_ID ?? "mock_ads_app",
    adsSecret: env.MOCK_ADS_SECRET ?? env.TIKTOK_ADS_APP_SECRET ?? "mock_ads_secret",
    accessTtlSec: num(env.MOCK_ACCESS_TTL_SEC, 7 * 86_400),
    shopRedirectUri: env.MOCK_SHOP_REDIRECT_URI ?? env.TIKTOK_SHOP_REDIRECT_URI ?? "http://localhost:4000/api/connections/shop/callback",
    webhookUrl: env.MOCK_WEBHOOK_URL ?? "",
    webhookIntervalSec: num(env.MOCK_WEBHOOK_INTERVAL_SEC, 30),
    faultRate: num(env.MOCK_FAULT_RATE, 0),
    scale: num(env.MOCK_SCALE, 1),
  };
}
