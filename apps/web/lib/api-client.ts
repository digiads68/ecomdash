import { useAuth } from "@clerk/nextjs";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token: string | null }
): Promise<T> {
  const { token, ...rest } = options;

  const res = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...rest.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "API error" }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export function useApiClient() {
  const { getToken } = useAuth();

  return async function fetchWithAuth<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return apiFetch<T>(path, { ...options, token });
  };
}
