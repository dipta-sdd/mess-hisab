"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemResponse, ListResponse, MealEntry, MealInput, MealTracking, Member, MessWithMe, Month } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";
import { invalidateMoney } from "@/lib/api/query-keys";

export interface MealTotals { meals_centi: number; guest_meals_centi: number }
export interface MealsResponse {
  month_id: number;
  style: MealTracking;
  entries: MealEntry[];
  totals: Record<string, MealTotals>;
}

export const mealsKeys = {
  all: (messId: number) => ["meals", messId] as const,
  mess: (messId: number) => ["meals", messId, "mess"] as const,
  members: (messId: number) => ["meals", messId, "members"] as const,
  months: (messId: number) => ["meals", messId, "months"] as const,
  currentMonth: (messId: number) => ["meals", messId, "month-current"] as const,
  entries: (messId: number, monthId: number | null, memberId: number | null = null) => ["meals", messId, "entries", monthId, memberId] as const,
};

const base = (messId: number) => `/api/messes/${messId}`;

export function useMessInfo(messId: number) {
  return useQuery({
    queryKey: mealsKeys.mess(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<MessWithMe>>(base(messId))).data,
  });
}

export function useMembers(messId: number, enabled = true) {
  return useQuery({
    queryKey: mealsKeys.members(messId),
    enabled,
    queryFn: async () => (await apiClient.get<ListResponse<Member>>(`${base(messId)}/members`)).data,
  });
}

export function useMonths(messId: number) {
  return useQuery({
    queryKey: mealsKeys.months(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Month>>(`${base(messId)}/months`)).data,
  });
}

export function useCurrentMonth(messId: number) {
  return useQuery({
    queryKey: mealsKeys.currentMonth(messId),
    queryFn: async () => (await apiClient.get<ItemResponse<Month>>(`${base(messId)}/months/current`)).data,
  });
}

/** `memberId` narrows the grid to one member (the signed-in member's own page); omit it for everyone. */
export function useMeals(messId: number, monthId: number | null, memberId: number | null = null) {
  return useQuery({
    queryKey: mealsKeys.entries(messId, monthId, memberId),
    enabled: monthId !== null,
    queryFn: async () =>
      (await apiClient.get<ItemResponse<MealsResponse>>(`${base(messId)}/meals`, { query: { month_id: monthId, member_id: memberId ?? undefined } })).data,
  });
}

/** Single upsert (a member entering their own meals). */
export function useSaveMeal(messId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: MealInput) => (await apiClient.put<ItemResponse<MealEntry>>(`${base(messId)}/meals`, input)).data,
    onSuccess: () => invalidateMoney(client, messId),
  });
}

/** Manager bulk upsert; the server applies all entries in one transaction. */
export function useBulkSaveMeals(messId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (entries: MealInput[]) =>
      (await apiClient.put<ListResponse<MealEntry>>(`${base(messId)}/meals/bulk`, { entries })).data,
    onSuccess: () => invalidateMoney(client, messId),
  });
}
