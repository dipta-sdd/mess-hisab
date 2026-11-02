"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Dashboard, DashboardRow, ItemResponse, SettlementResult } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";

export const settlementKeys = {
  dashboard: (messId: number) => ["settlement", messId, "dashboard"] as const,
};

/** Current balances + cash pool (the dashboard endpoint with no month = the server's default month). */
export function useSettlementDashboard(messId: number, enabled = true) {
  return useQuery({
    queryKey: settlementKeys.dashboard(messId),
    enabled,
    queryFn: async () => (await apiClient.get<ItemResponse<Dashboard>>(`/api/messes/${messId}/dashboard`)).data,
  });
}

/** The member's row in the dashboard, if any. */
export function rowFor(dashboard: Dashboard | undefined, memberId: number): DashboardRow | undefined {
  return dashboard?.members.find((r) => r.member_id === memberId);
}

export interface FinalSettlementInput {
  amount_paisa: number;
  paid_on: string;
}

export function useFinalSettlement(messId: number, memberId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: FinalSettlementInput) =>
      (await apiClient.post<ItemResponse<SettlementResult>>(`/api/messes/${messId}/members/${memberId}/final-settlement`, input)).data,
    onSuccess: async () => {
      // The payout moves one member's balance and the cash pool: refresh everything money-shaped.
      await Promise.all([
        client.invalidateQueries({ queryKey: settlementKeys.dashboard(messId) }),
        client.invalidateQueries({ queryKey: ["balance", messId] }),
        client.invalidateQueries({ queryKey: ["payments", messId] }),
        client.invalidateQueries({ queryKey: ["audit", messId] }),
      ]);
    },
  });
}
