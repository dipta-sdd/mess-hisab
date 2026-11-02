import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Member, Mess } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client/client";
import { meQueryKey } from "@/lib/api-client/auth";

/** Laravel resources wrap in `{data: ...}`; tolerate unwrapped bodies too. */
export function unwrap<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) return (body as { data: T }).data;
  return body as T;
}

/** Where a signed-in user lands inside a mess until a dashboard exists. */
export function messHomePath(messId: number): string {
  return `/${messId}/members`;
}

export interface MessDetail {
  mess: Mess;
  me: Member;
}

export const messDetailKey = (messId: number) => ["mess", messId, "detail"] as const;

/** GET /api/messes/{id} -> {mess, me}. */
export function useMessDetail(messId: number) {
  return useQuery({
    queryKey: messDetailKey(messId),
    queryFn: async () => unwrap<MessDetail>(await apiClient.get(`/api/messes/${messId}`)),
  });
}

export interface MessRoles {
  isAdmin: boolean;
  isManager: boolean;
  isArchived: boolean;
  /** Admin or manager and not archived: may add/edit/archive members and manage invites. */
  canManage: boolean;
  /** Admin and not archived: may edit settings and hand over roles. */
  canAdmin: boolean;
  ready: boolean;
}

export function useMessRoles(messId: number): MessRoles {
  const { data } = useMessDetail(messId);
  const me = data?.me;
  const isAdmin = !!me?.is_admin;
  const isManager = !!me?.is_manager;
  const isArchived = !!me?.archived_at;
  return {
    isAdmin,
    isManager,
    isArchived,
    canManage: !isArchived && (isAdmin || isManager),
    canAdmin: !isArchived && isAdmin,
    ready: !!me,
  };
}

export interface CreateMessPayload {
  name: string;
  month_start_day?: number;
  first_month_starts_on: string;
  creator_display_name: string;
  creator_opening_balance_paisa?: number;
  members?: { display_name: string; opening_balance_paisa?: number }[];
}

export function useCreateMess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateMessPayload) =>
      unwrap<{ mess: Mess; member: Member }>(await apiClient.post("/api/messes", payload)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
    },
  });
}
