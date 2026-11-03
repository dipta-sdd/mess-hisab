"use client";

import { useQuery } from "@tanstack/react-query";
import type { Dashboard, HistoryRow, ItemResponse, ListResponse, Member, MemberHistoryRow, MessWithMe, Statement } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";

export const balanceKeys = {
  all: (messId: number) => ["balance", messId] as const,
  mess: (messId: number) => ["balance", messId, "mess"] as const,
  dashboard: (messId: number, monthId: number | null, own = false) => ["balance", messId, "dashboard", monthId, own] as const,
  statement: (messId: number, memberId: number, monthId: number | null) => ["balance", messId, "statement", memberId, monthId] as const,
  history: (messId: number) => ["balance", messId, "history"] as const,
  memberHistory: (messId: number, memberId: number) => ["balance", messId, "member-history", memberId] as const,
};

const base = (messId: number) => `/api/messes/${messId}`;

export function useMessInfo(messId: number) {
  return useQuery({
    queryKey: balanceKeys.mess(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<MessWithMe>>(base(messId))).data,
  });
}

export function useMembers(messId: number) {
  return useQuery({
    queryKey: ["balance", messId, "members"] as const,
    queryFn: async () => (await apiClient.get<ListResponse<Member>>(`${base(messId)}/members`)).data,
  });
}

/** `monthId` null = let the server pick its default month (the param is omitted). */
export function useDashboard(messId: number, monthId: number | null, own = false) {
  return useQuery({
    queryKey: balanceKeys.dashboard(messId, monthId, own),
    queryFn: async () =>
      (await apiClient.get<ItemResponse<Dashboard>>(`${base(messId)}/dashboard`, { query: { month_id: monthId, scope: own ? "own" : undefined } })).data,
  });
}

export function useStatement(messId: number, memberId: number | null, monthId: number | null) {
  return useQuery({
    queryKey: balanceKeys.statement(messId, memberId ?? 0, monthId),
    enabled: memberId !== null,
    queryFn: async () =>
      (
        await apiClient.get<ItemResponse<Statement>>(`${base(messId)}/statements/${memberId}`, { query: { month_id: monthId } })
      ).data,
  });
}

/** GET /statements/{member}/history: one row per month the member was in, newest first. */
export function useMemberHistory(messId: number, memberId: number | null) {
  return useQuery({
    queryKey: balanceKeys.memberHistory(messId, memberId ?? 0),
    enabled: memberId !== null,
    queryFn: async () =>
      (await apiClient.get<ListResponse<MemberHistoryRow>>(`${base(messId)}/statements/${memberId}/history`)).data,
  });
}

export function useHistory(messId: number) {
  return useQuery({
    queryKey: balanceKeys.history(messId),
    queryFn: async () => (await apiClient.get<ListResponse<HistoryRow>>(`${base(messId)}/history`)).data,
  });
}
