"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Adjustment, CloseCheck, Dashboard, DoesntPayMode, Group, ItemResponse, ListResponse, Member, Mess, Month,
  Recoverable, RecoverableStatus, ReopenPreview, ZeroMealResolution,
} from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";

/** Local copy of the `GET /messes/{id}` payload (promote to contract.ts). */
export interface MessWithMe { mess: Mess; me: Member }
export interface DoesntPayInput { member_id: number; mode: DoesntPayMode; manual?: { member_id: number; amount_paisa: number }[] }
export interface RepaymentInput { amount_paisa: number; paid_on: string }
export interface AdjustmentInput { member_id: number; group: Group; amount_paisa: number; note: string }

export const monthsKeys = {
  all: (messId: number) => ["months", messId] as const,
  mess: (messId: number) => ["months", messId, "mess"] as const,
  members: (messId: number) => ["months", messId, "members"] as const,
  list: (messId: number) => ["months", messId, "list"] as const,
  dashboard: (messId: number, monthId: number | null) => ["months", messId, "dashboard", monthId] as const,
  closeCheck: (messId: number, monthId: number, resolution: ZeroMealResolution | null) => ["months", messId, "close-check", monthId, resolution] as const,
  reopenPreview: (messId: number, monthId: number) => ["months", messId, "reopen-preview", monthId] as const,
  recoverables: (messId: number, monthId: number | null, status: RecoverableStatus | null) => ["months", messId, "recoverables", monthId, status] as const,
  adjustments: (messId: number) => ["months", messId, "adjustments"] as const,
};

const base = (messId: number) => `/api/messes/${messId}`;

export function useMessInfo(messId: number) {
  return useQuery({
    queryKey: monthsKeys.mess(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<MessWithMe>>(base(messId))).data,
  });
}

export function useMembers(messId: number) {
  return useQuery({
    queryKey: monthsKeys.members(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Member>>(`${base(messId)}/members`)).data,
  });
}

/** Newest first. */
export function useMonths(messId: number) {
  return useQuery({
    queryKey: monthsKeys.list(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Month>>(`${base(messId)}/months`)).data,
  });
}

/** Dashboard rows give each member's live balance (the debt shown for "doesn't pay"). */
export function useDashboard(messId: number, monthId: number | null) {
  return useQuery({
    queryKey: monthsKeys.dashboard(messId, monthId),
    enabled: monthId !== null,
    queryFn: async () => (await apiClient.get<ItemResponse<Dashboard>>(`${base(messId)}/dashboard`, { query: { month_id: monthId } })).data,
  });
}

/** Everything a write can change: this feature, plus the dashboard/statement caches of other features. */
function useRefreshAfterWrite(messId: number) {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: monthsKeys.all(messId) }),
      client.invalidateQueries({ queryKey: ["balance", messId] }),
    ]);
  };
}

export function useCloseCheck(messId: number, monthId: number, resolution: ZeroMealResolution | null, enabled: boolean) {
  return useQuery({
    queryKey: monthsKeys.closeCheck(messId, monthId, resolution),
    enabled,
    staleTime: 0,
    gcTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await apiClient.get<ItemResponse<CloseCheck>>(`${base(messId)}/months/${monthId}/close-check`, { query: { zero_meal_resolution: resolution } })).data,
  });
}

export function useCloseMonth(messId: number, monthId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (resolution: ZeroMealResolution | null) =>
      (await apiClient.post<ItemResponse<Month>>(`${base(messId)}/months/${monthId}/close`, resolution ? { zero_meal_resolution: resolution } : {})).data,
    onSuccess: refresh,
  });
}

export function useReopenPreview(messId: number, monthId: number, enabled: boolean) {
  return useQuery({
    queryKey: monthsKeys.reopenPreview(messId, monthId),
    enabled,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => (await apiClient.get<ItemResponse<ReopenPreview>>(`${base(messId)}/months/${monthId}/reopen-preview`)).data,
  });
}

export function useReopenMonth(messId: number, monthId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async () => (await apiClient.post<ItemResponse<Month>>(`${base(messId)}/months/${monthId}/reopen`, {})).data,
    onSuccess: refresh,
  });
}

export function useRecoverables(messId: number, monthId: number | null = null, status: RecoverableStatus | null = null) {
  return useQuery({
    queryKey: monthsKeys.recoverables(messId, monthId, status),
    queryFn: async () =>
      (await apiClient.get<ListResponse<Recoverable>>(`${base(messId)}/recoverables`, { query: { month_id: monthId, status } })).data,
  });
}

export function useCreateDoesntPay(messId: number, monthId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (input: DoesntPayInput) =>
      (await apiClient.post<ItemResponse<Recoverable>>(`${base(messId)}/months/${monthId}/doesnt-pay`, input)).data,
    onSuccess: refresh,
  });
}

export function useUndoDoesntPay(messId: number, monthId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (recoverableId: number) => {
      await apiClient.delete(`${base(messId)}/months/${monthId}/doesnt-pay/${recoverableId}`);
    },
    onSuccess: refresh,
  });
}

export function useRepay(messId: number, recoverableId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (input: RepaymentInput) =>
      (await apiClient.post<ItemResponse<Recoverable>>(`${base(messId)}/recoverables/${recoverableId}/repayments`, input)).data,
    onSuccess: refresh,
  });
}

export function useAdjustments(messId: number) {
  return useQuery({
    queryKey: monthsKeys.adjustments(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Adjustment>>(`${base(messId)}/adjustments`)).data,
  });
}

export function useCreateAdjustment(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (input: AdjustmentInput) => (await apiClient.post<ItemResponse<Adjustment>>(`${base(messId)}/adjustments`, input)).data,
    onSuccess: refresh,
  });
}
