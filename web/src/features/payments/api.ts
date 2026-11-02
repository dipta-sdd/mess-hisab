"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Group, ItemResponse, ListResponse, Member, Mess, Month, Payment } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";

export interface MessWithMe { mess: Mess; me: Member }
export interface CashPool { pool_balance_paisa: number; manager_member_id: number | null }
export interface PaymentInput { member_id: number; group: Group; amount_paisa: number; paid_on: string; note: string | null }

export const paymentsKeys = {
  all: (messId: number) => ["payments", messId] as const,
  mess: (messId: number) => ["payments", messId, "mess"] as const,
  members: (messId: number) => ["payments", messId, "members"] as const,
  months: (messId: number) => ["payments", messId, "months"] as const,
  currentMonth: (messId: number) => ["payments", messId, "month-current"] as const,
  cash: (messId: number) => ["payments", messId, "cash"] as const,
  list: (messId: number, monthId: number | null, memberId: number | null) => ["payments", messId, "list", monthId, memberId] as const,
};

const base = (messId: number) => `/api/messes/${messId}`;

export function useMessInfo(messId: number) {
  return useQuery({
    queryKey: paymentsKeys.mess(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<MessWithMe>>(base(messId))).data,
  });
}

export function useMembers(messId: number) {
  return useQuery({
    queryKey: paymentsKeys.members(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Member>>(`${base(messId)}/members`)).data,
  });
}

export function useMonths(messId: number) {
  return useQuery({
    queryKey: paymentsKeys.months(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Month>>(`${base(messId)}/months`)).data,
  });
}

export function useCurrentMonth(messId: number) {
  return useQuery({
    queryKey: paymentsKeys.currentMonth(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<Month>>(`${base(messId)}/months/current`)).data,
  });
}

export function useCash(messId: number) {
  return useQuery({
    queryKey: paymentsKeys.cash(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<CashPool>>(`${base(messId)}/cash`)).data,
  });
}

export function usePayments(messId: number, monthId: number | null, memberId: number | null) {
  return useQuery({
    queryKey: paymentsKeys.list(messId, monthId, memberId),
    enabled: monthId !== null,
    queryFn: async () =>
      (
        await apiClient.get<ListResponse<Payment>>(`${base(messId)}/payments`, {
          query: { month_id: monthId, member_id: memberId },
        })
      ).data,
  });
}

/** A payment changes the cash pool and may move between months, so refresh the whole feature. */
function useRefreshAfterWrite(messId: number) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: paymentsKeys.all(messId) });
}

export function useCreatePayment(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (input: PaymentInput) => (await apiClient.post<ItemResponse<Payment>>(`${base(messId)}/payments`, input)).data,
    onSuccess: refresh,
  });
}

export function useUpdatePayment(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async ({ id, input }: { id: number; input: PaymentInput }) =>
      (await apiClient.patch<ItemResponse<Payment>>(`${base(messId)}/payments/${id}`, input)).data,
    onSuccess: refresh,
  });
}

export function useDeletePayment(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`${base(messId)}/payments/${id}`);
    },
    onSuccess: refresh,
  });
}
