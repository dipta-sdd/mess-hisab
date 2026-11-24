"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { Bill, CloseBillEdit, ItemResponse, ListResponse, Month, ZeroMealResolution } from "@/lib/api/contract";
import { apiClient, postForFile } from "@/lib/api-client";
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

/** Next month's Fixed bills to start the preview from: its saved ones, else this month's. Read-only on the server. */
export function usePreviewNextBills(messId: number, monthId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["reports", messId, "preview-next-bills", monthId] as const,
    enabled,
    staleTime: 0,
    gcTime: 0,
    queryFn: async () =>
      (await apiClient.get<ItemResponse<{ next_month_exists: boolean; bills: Bill[] }>>(`${base(messId)}/reports/monthly/${monthId}/preview/next-bills`)).data,
  });
}

/** What the close popup asked, as the preview endpoints take it. Nothing is saved. */
export interface PreviewAnswers {
  resolution: ZeroMealResolution | null;
  bills: CloseBillEdit[];
  nextBills: CloseBillEdit[] | null;
  /** Spare cash to share equally (paisa); 0 = none. */
  surplusPaisa?: number;
}

function previewBody({ resolution, bills, nextBills, surplusPaisa = 0 }: PreviewAnswers) {
  return {
    ...(resolution ? { zero_meal_resolution: resolution } : {}),
    ...(bills.length > 0 ? { bills } : {}),
    ...(nextBills ? { next_bills: nextBills } : {}),
    ...(surplusPaisa > 0 ? { surplus_paisa: surplusPaisa } : {}),
  };
}

export function usePreviewReport(messId: number, monthId: number) {
  return useMutation({
    mutationFn: async (answers: PreviewAnswers) =>
      (await apiClient.post<ItemResponse<MonthlyReport>>(`${base(messId)}/reports/monthly/${monthId}/preview`, previewBody(answers))).data,
  });
}

/** Asks the server for the preview PDF with the same answers and saves it in the browser. */
export async function downloadPreviewPdf(messId: number, monthId: number, answers: PreviewAnswers) {
  const { blob, filename } = await postForFile(`${base(messId)}/reports/monthly/${monthId}/preview/pdf`, previewBody(answers));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `mess-preview-${monthId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
