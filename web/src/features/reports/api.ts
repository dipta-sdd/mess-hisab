"use client";

import { useQuery } from "@tanstack/react-query";
import type { ItemResponse, ListResponse, Month } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";
import type { MonthlyReport } from "./types";

export const reportKeys = {
  months: (messId: number) => ["reports", messId, "months"] as const,
  monthly: (messId: number, monthId: number) => ["reports", messId, "monthly", monthId] as const,
};

const base = (messId: number) => `/api/messes/${messId}`;

/** All months, newest first (the page keeps the closed ones). */
export function useReportMonths(messId: number) {
  return useQuery({
    queryKey: reportKeys.months(messId),
    queryFn: async () => (await apiClient.get<ListResponse<Month>>(`${base(messId)}/months`)).data,
  });
}

export function useMonthlyReport(messId: number, monthId: number | null) {
  return useQuery({
    queryKey: reportKeys.monthly(messId, monthId ?? 0),
    enabled: monthId !== null,
    queryFn: async () => (await apiClient.get<ItemResponse<MonthlyReport>>(`${base(messId)}/reports/monthly/${monthId}`)).data,
  });
}
