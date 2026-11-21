"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: (n, e) => (e as { status?: number }).status !== 401 && (e as { status?: number }).status !== 403 && n < 1 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
