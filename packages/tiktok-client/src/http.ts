export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
  status: number;
  text(): Promise<string>;
}>;

export interface TransportOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  rps?: number;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Simple token bucket shared by one client instance. */
export class RateLimiter {
  private nextSlot = 0;
  constructor(private readonly rps: number, private readonly sleep: (ms: number) => Promise<void>) {}
  async take(): Promise<void> {
    if (!this.rps || this.rps <= 0) return;
    const gap = 1000 / this.rps;
    const now = Date.now();
    const at = Math.max(now, this.nextSlot);
    this.nextSlot = at + gap;
    if (at > now) await this.sleep(at - now);
  }
}

export function backoffMs(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** attempt);
}

export async function fetchText(
  fetchImpl: FetchLike,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  timeoutMs: number,
): Promise<{ status: number; text: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    return { status: res.status, text: await res.text() };
  } finally {
    clearTimeout(t);
  }
}

export function resolveFetch(f?: FetchLike): FetchLike {
  if (f) return f;
  if (typeof globalThis.fetch !== "function") throw new Error("global fetch is not available (Node ≥ 18 required)");
  return globalThis.fetch as unknown as FetchLike;
}
