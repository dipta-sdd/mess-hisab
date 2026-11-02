"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Export, ItemResponse } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";

export type ExportType = "month" | "statement";
export interface ExportRequest { type: ExportType; month_id: number; member_id?: number }

/** Poll every 2 s, give up after ~2 minutes. */
export const DEFAULT_POLL_MS = 2000;
export const DEFAULT_MAX_POLLS = 60;

const base = (messId: number) => `/api/messes/${messId}`;

export function useCreateExport(messId: number) {
  return useMutation({
    mutationFn: async (input: ExportRequest) => (await apiClient.post<ItemResponse<Export>>(`${base(messId)}/exports`, input)).data,
  });
}

/** Fetches the export and keeps refetching until it is `done`/`failed` (or `maxPolls` is reached). */
export function useExportStatus(messId: number, exportId: number | null, pollMs = DEFAULT_POLL_MS, maxPolls = DEFAULT_MAX_POLLS) {
  const [polls, setPolls] = useState(0);
  const query = useQuery({
    queryKey: ["export", messId, exportId] as const,
    enabled: exportId !== null,
    gcTime: 0,
    queryFn: async () => {
      const result = (await apiClient.get<ItemResponse<Export>>(`${base(messId)}/exports/${exportId}`)).data;
      setPolls((n) => n + 1);
      return result;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done" || status === "failed") return false;
      if (query.state.dataUpdateCount >= maxPolls) return false;
      return pollMs;
    },
  });
  return { ...query, polls };
}
