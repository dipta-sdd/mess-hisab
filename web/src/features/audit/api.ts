"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { AuditLog, Member } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client";

/** Laravel length-aware paginator envelope (only the fields we use). Local type: promote to contract.ts. */
export interface Paginated<T> {
  data: T[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: { current_page: number; last_page: number; per_page: number; total: number; from: number | null; to: number | null };
}

export interface AuditFilters {
  event: string;
  member_id: string;
  from: string;
  to: string;
  page: number;
}

export const auditKeys = {
  all: (messId: number) => ["audit", messId] as const,
  list: (messId: number, f: AuditFilters) => ["audit", messId, "list", f] as const,
  members: (messId: number) => ["audit", messId, "members"] as const,
};

export function useAuditLog(messId: number, filters: AuditFilters, enabled = true) {
  return useQuery({
    queryKey: auditKeys.list(messId, filters),
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      apiClient.get<Paginated<AuditLog>>(`/api/messes/${messId}/audit`, {
        query: {
          event: filters.event || undefined,
          member_id: filters.member_id || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page > 1 ? filters.page : undefined,
        },
      }),
  });
}

export function useAuditMembers(messId: number) {
  return useQuery({
    queryKey: auditKeys.members(messId),
    queryFn: async () => (await apiClient.get<{ data: Member[] }>(`/api/messes/${messId}/members`)).data,
  });
}
