"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import type { AlertInstanceDto } from "@ecomdash/shared";

export function useNotifications() {
  const fetchWithAuth = useApiClient();
  const queryClient = useQueryClient();

  const { data: alerts = [] } = useQuery<AlertInstanceDto[]>({
    queryKey: ["alerts", "instances"],
    queryFn: () => fetchWithAuth<AlertInstanceDto[]>("/alerts/instances?limit=30"),
    refetchInterval: 60_000,
  });

  const firingCount = alerts.filter(
    (a) => a.state === "FIRING" && !a.acknowledgedAt
  ).length;

  const acknowledgeMutation = useMutation({
    mutationFn: (id: string) =>
      fetchWithAuth(`/alerts/instances/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts", "instances"] });
    },
  });

  return {
    alerts,
    firingCount,
    acknowledgeAlert: (id: string) => acknowledgeMutation.mutate(id),
  };
}
