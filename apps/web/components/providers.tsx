"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { AUTH_MODE } from "@/lib/auth-mode";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 } } }));
  const inner = <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return AUTH_MODE === "clerk" ? <ClerkProvider>{inner}</ClerkProvider> : inner;
}
