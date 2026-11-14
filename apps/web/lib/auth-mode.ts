export const AUTH_MODE = (process.env.NEXT_PUBLIC_AUTH_MODE ?? "demo") as "demo" | "clerk";
export const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
