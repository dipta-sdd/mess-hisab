"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Category,
  Expense,
  ExpenseInput,
  ExpensePatch,
  ExpenseStatus,
  ItemResponse,
  ListResponse,
  Member,
  MessWithMe,
  Month,
} from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";
import { invalidateMoney } from "@/lib/api/query-keys";

export interface CreateResult { expense: Expense; warnings: string[] }
export interface ExpenseFilters { monthId: number | null; status: ExpenseStatus | null; memberId: number | null; categoryId: number | null }

export const expensesKeys = {
  all: (messId: number) => ["expenses", messId] as const,
  mess: (messId: number) => ["expenses", messId, "mess"] as const,
  members: (messId: number) => ["expenses", messId, "members"] as const,
  months: (messId: number) => ["expenses", messId, "months"] as const,
  currentMonth: (messId: number) => ["expenses", messId, "month-current"] as const,
  categories: (messId: number) => ["expenses", messId, "categories"] as const,
  list: (messId: number, f: ExpenseFilters) => ["expenses", messId, "list", f.monthId, f.status, f.memberId, f.categoryId] as const,
  pending: (messId: number) => ["expenses", messId, "pending"] as const,
};

const base = (messId: number) => `/api/messes/${messId}`;

export function useMessInfo(messId: number) {
  return useQuery({
    queryKey: expensesKeys.mess(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<MessWithMe>>(base(messId))).data,
  });
}

export function useMembers(messId: number, enabled = true) {
  return useQuery({
    queryKey: expensesKeys.members(messId),
    enabled,
    queryFn: async () => (await apiClient.get<ListResponse<Member>>(`${base(messId)}/members`)).data,
  });
}

export function useMonths(messId: number) {
  return useQuery({
    queryKey: expensesKeys.months(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Month>>(`${base(messId)}/months`)).data,
  });
}

export function useCurrentMonth(messId: number) {
  return useQuery({
    queryKey: expensesKeys.currentMonth(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<Month>>(`${base(messId)}/months/current`)).data,
  });
}

export function useCategories(messId: number) {
  return useQuery({
    queryKey: expensesKeys.categories(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Category>>(`${base(messId)}/categories`)).data,
  });
}

export function useExpenses(messId: number, filters: ExpenseFilters) {
  return useQuery({
    queryKey: expensesKeys.list(messId, filters),
    enabled: filters.monthId !== null,
    queryFn: async () =>
      (
        await apiClient.get<ListResponse<Expense>>(`${base(messId)}/expenses`, {
          query: { month_id: filters.monthId, status: filters.status, member_id: filters.memberId, category_id: filters.categoryId },
        })
      ).data,
  });
}

/** Every pending expense of the mess, any month (the approval queue). */
export function usePendingExpenses(messId: number, enabled: boolean) {
  return useQuery({
    queryKey: expensesKeys.pending(messId),
    enabled,
    queryFn: async () => (await apiClient.get<ListResponse<Expense>>(`${base(messId)}/expenses`, { query: { status: "pending" } })).data,
  });
}

/** Expenses (and approvals) move balances and the cash pool: refresh every money cache. */
function useRefreshAfterWrite(messId: number) {
  const client = useQueryClient();
  return () => invalidateMoney(client, messId);
}

export function useCreateExpense(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (input: ExpenseInput) => (await apiClient.post<ItemResponse<CreateResult>>(`${base(messId)}/expenses`, input)).data,
    onSuccess: refresh,
  });
}

export function useUpdateExpense(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: ExpensePatch }) =>
      (await apiClient.patch<ItemResponse<Expense>>(`${base(messId)}/expenses/${id}`, patch)).data,
    onSuccess: refresh,
  });
}

export function useDeleteExpense(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`${base(messId)}/expenses/${id}`);
    },
    onSuccess: refresh,
  });
}

export function useApproveExpense(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.post<ItemResponse<Expense>>(`${base(messId)}/expenses/${id}/approve`, {})).data,
    onSuccess: refresh,
  });
}

export function useRejectExpense(messId: number) {
  const refresh = useRefreshAfterWrite(messId);
  return useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
      (await apiClient.post<ItemResponse<Expense>>(`${base(messId)}/expenses/${id}/reject`, { reason })).data,
    onSuccess: refresh,
  });
}
