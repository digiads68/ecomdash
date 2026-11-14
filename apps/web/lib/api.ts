"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import { AUTH_MODE } from "./auth-mode";
import { useAppStore, usePeriod } from "./store";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/api\/?$/, "");

type TokenFn = () => Promise<string | null>;

/** Demo mode never touches Clerk (no keys needed); the mode is a build-time constant so hook order is stable. */
function useTokenFn(): TokenFn {
  if (AUTH_MODE === "clerk") {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { getToken } = useAuth();
    return getToken;
  }
  return async () => null;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, getToken?: TokenFn): Promise<T> {
  const token = getToken ? await getToken() : null;
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(Array.isArray(body?.message) ? body.message.join(", ") : body?.message ?? `Lỗi ${res.status}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export function useApiFetch() {
  const getToken = useTokenFn();
  return <T,>(path: string, init?: RequestInit) => apiFetch<T>(path, init, getToken);
}

const qs = (p: Record<string, string | number | boolean | undefined | null>) =>
  Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

/** GET endpoint; `shop: true` adds shopId + current period and waits for a selected shop. */
export function useApi<T>(path: string, params: Record<string, string | number | boolean | undefined | null> = {}, opts: { shop?: boolean; period?: boolean } & Partial<UseQueryOptions<T>> = {}) {
  const f = useApiFetch();
  const shopId = useAppStore((s) => s.shopId);
  const period = usePeriod();
  const { shop = true, period: withPeriod = shop, ...rest } = opts;
  const all = { ...(shop ? { shopId } : {}), ...(withPeriod ? { from: period.from, to: period.to } : {}), ...params };
  const query = qs(all);
  return useQuery<T>({
    queryKey: [path, query],
    queryFn: () => f<T>(`${path}${query ? `?${query}` : ""}`),
    enabled: !shop || !!shopId,
    ...rest,
  });
}

export function useApiMutation<TBody, TRes = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE", pathOf: (b: TBody) => string, invalidate: string[] = []) {
  const f = useApiFetch();
  const qc = useQueryClient();
  return useMutation<TRes, ApiError, TBody>({
    mutationFn: (b) => f<TRes>(pathOf(b), { method, body: method === "DELETE" ? undefined : JSON.stringify(b) }),
    onSuccess: () => invalidate.forEach((p) => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(p) })),
  });
}
