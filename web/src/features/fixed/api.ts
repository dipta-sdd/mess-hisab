"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Bill,
  BillInput,
  Category,
  ItemResponse,
  ListResponse,
  Member,
  MemberMonthSetting,
  MemberSettingInput,
  MessWithMe,
  Month,
  MonthSetupInput,
} from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";
import { invalidateMoney } from "@/lib/api/query-keys";

export interface MonthSetupData { month: Month; bills: Bill[]; member_settings: MemberMonthSettingRow[] }
/** The API sends null for "no override for this member"; contract.ts types it as a number. */
export interface MemberMonthSettingRow extends Omit<MemberMonthSetting, "deposit_paisa"> { deposit_paisa: number | null }

export const fixedKeys = {
  all: (messId: number) => ["fixed", messId] as const,
  mess: (messId: number) => ["fixed", messId, "mess"] as const,
  members: (messId: number) => ["fixed", messId, "members"] as const,
  months: (messId: number) => ["fixed", messId, "months"] as const,
  currentMonth: (messId: number) => ["fixed", messId, "month-current"] as const,
  categories: (messId: number) => ["fixed", messId, "categories"] as const,
  setup: (messId: number, monthId: number | null) => ["fixed", messId, "setup", monthId] as const,
};

const base = (messId: number) => `/api/messes/${messId}`;

export function useMessInfo(messId: number) {
  return useQuery({
    queryKey: fixedKeys.mess(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<MessWithMe>>(base(messId))).data,
  });
}

export function useMembers(messId: number) {
  return useQuery({
    queryKey: fixedKeys.members(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Member>>(`${base(messId)}/members`)).data,
  });
}

export function useMonths(messId: number) {
  return useQuery({
    queryKey: fixedKeys.months(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Month>>(`${base(messId)}/months`)).data,
  });
}

export function useCurrentMonth(messId: number) {
  return useQuery({
    queryKey: fixedKeys.currentMonth(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<Month>>(`${base(messId)}/months/current`)).data,
  });
}

export function useCategories(messId: number) {
  return useQuery({
    queryKey: fixedKeys.categories(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Category>>(`${base(messId)}/categories`)).data,
  });
}

export function useSetup(messId: number, monthId: number | null) {
  return useQuery({
    queryKey: fixedKeys.setup(messId, monthId),
    enabled: monthId !== null,
    queryFn: async () => (await apiClient.get<ItemResponse<MonthSetupData>>(`${base(messId)}/months/${monthId}/setup`)).data,
  });
}

/** Every write changes the setup (and a month's deposit shows in the month list), so refresh every money cache. */
function useRefresh(messId: number) {
  const client = useQueryClient();
  return () => invalidateMoney(client, messId);
}

export function useSaveBill(messId: number, monthId: number) {
  const refresh = useRefresh(messId);
  return useMutation({
    mutationFn: async ({ categoryId, input }: { categoryId: number; input: BillInput }) =>
      (await apiClient.put<ItemResponse<Bill>>(`${base(messId)}/months/${monthId}/bills/${categoryId}`, input)).data,
    onSuccess: refresh,
  });
}

export function useSpreadBill(messId: number, monthId: number) {
  const refresh = useRefresh(messId);
  return useMutation({
    mutationFn: async (categoryId: number) =>
      (await apiClient.post<ItemResponse<Bill>>(`${base(messId)}/months/${monthId}/bills/${categoryId}/spread`)).data,
    onSuccess: refresh,
  });
}

export function useAcceptBill(messId: number, monthId: number) {
  const refresh = useRefresh(messId);
  return useMutation({
    mutationFn: async (categoryId: number) =>
      (await apiClient.post<ItemResponse<Bill>>(`${base(messId)}/months/${monthId}/bills/${categoryId}/accept`)).data,
    onSuccess: refresh,
  });
}

export function useUpdateMonthSetup(messId: number, monthId: number) {
  const refresh = useRefresh(messId);
  return useMutation({
    mutationFn: async (input: MonthSetupInput) =>
      (await apiClient.patch<ItemResponse<Month>>(`${base(messId)}/months/${monthId}/setup`, input)).data,
    onSuccess: refresh,
  });
}

export function useUpdateMemberSettings(messId: number, monthId: number) {
  const refresh = useRefresh(messId);
  return useMutation({
    mutationFn: async ({ memberId, input }: { memberId: number; input: MemberSettingInput }) =>
      (await apiClient.put<ItemResponse<MemberMonthSettingRow>>(`${base(messId)}/months/${monthId}/members/${memberId}/settings`, input)).data,
    onSuccess: refresh,
  });
}
