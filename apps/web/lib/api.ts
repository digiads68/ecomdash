"use client";

import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";
import type { MeDto, ShopDto } from "@ecomdash/shared";
import { useAppStore, usePeriod } from "./store";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/api\/?$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Calls the API with the session cookie (`ecomdash_session`, set by the API). 401 sends the browser to /login. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && typeof window !== "undefined" && !/^\/(login|invite)/.test(window.location.pathname)) {
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
    }
    throw new ApiError(Array.isArray(body?.message) ? body.message.join(", ") : body?.message ?? `Lỗi ${res.status}`, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export function useApiFetch() {
  return apiFetch;
}

const qs = (p: Record<string, string | number | boolean | undefined | null>) =>
  Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");

/**
 * GET endpoint. `shop: true` (default) adds shopId + current period and waits for a selected shop;
 * `org: true` adds the organisation of the selected shop (org-level pages: connections, alerts, reports, members).
 */
export function useApi<T>(path: string, params: Record<string, string | number | boolean | undefined | null> = {}, opts: { shop?: boolean; period?: boolean; org?: boolean } & Partial<UseQueryOptions<T>> = {}) {
  const shopId = useAppStore((s) => s.shopId);
  const orgId = useCurrentOrgId();
  const period = usePeriod();
  const { shop = true, period: withPeriod = shop, org = false, ...rest } = opts;
  const all = { ...(shop ? { shopId } : {}), ...(org ? { orgId } : {}), ...(withPeriod ? { from: period.from, to: period.to } : {}), ...params };
  const query = qs(all);
  return useQuery<T>({
    queryKey: [path, query],
    queryFn: () => apiFetch<T>(`${path}${query ? `?${query}` : ""}`),
    enabled: (!shop || !!shopId) && (!org || !!orgId) && (rest.enabled ?? true),
    ...rest,
  } as UseQueryOptions<T>);
}

export function useApiMutation<TBody, TRes = unknown>(method: "POST" | "PUT" | "PATCH" | "DELETE", pathOf: (b: TBody) => string, invalidate: string[] = []) {
  const qc = useQueryClient();
  return useMutation<TRes, ApiError, TBody>({
    mutationFn: (b) => apiFetch<TRes>(pathOf(b), { method, body: method === "DELETE" ? undefined : JSON.stringify(b) }),
    onSuccess: () => invalidate.forEach((p) => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith(p) })),
  });
}

// ───── session & scope ─────
export function useMe() {
  return useQuery<MeDto>({ queryKey: ["/me"], queryFn: () => apiFetch<MeDto>("/me"), staleTime: 30_000 });
}

export function useShops() {
  return useQuery<ShopDto[]>({ queryKey: ["/shops", ""], queryFn: () => apiFetch<ShopDto[]>("/shops"), staleTime: 60_000 });
}

/** The shop picked in the top bar (with its organisation and whether the user may edit it). */
export function useCurrentShop(): ShopDto | undefined {
  const shopId = useAppStore((s) => s.shopId);
  const shops = useShops();
  return shops.data?.find((s) => s.id === shopId);
}

/** Organisation of the selected shop; falls back to the user's only organisation (e.g. before any shop is linked). */
export function useCurrentOrgId(): string | undefined {
  const shop = useCurrentShop();
  const me = useMe();
  return shop?.organizationId ?? (me.data?.organizations.length === 1 ? me.data.organizations[0].id : undefined);
}

export const isPlatformManager = (me?: MeDto) => me?.platformRole === "SUPER_ADMIN" || me?.platformRole === "ADMIN";

/** May change costs, alerts, reports and connections of the current organisation (MOD / MEMBER are read-only). */
export function useCanEdit(): boolean {
  const me = useMe();
  const orgId = useCurrentOrgId();
  if (isPlatformManager(me.data)) return true;
  return !!me.data?.organizations.find((o) => o.id === orgId)?.canEdit;
}

export async function logout() {
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => null);
  window.location.href = "/login";
}
