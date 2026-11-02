import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Invite, Member, Mess } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client/client";
import { meQueryKey } from "@/lib/api-client/auth";
import { messDetailKey, unwrap } from "@/features/mess/api";

export const membersKey = (messId: number) => ["mess", messId, "members"] as const;
export const invitesKey = (messId: number) => ["mess", messId, "invites"] as const;

export function useMembers(messId: number) {
  return useQuery({
    queryKey: membersKey(messId),
    queryFn: async () => unwrap<Member[]>(await apiClient.get(`/api/messes/${messId}/members`)),
  });
}

export interface AddMemberPayload {
  display_name: string;
  joined_on: string;
  opening_balance_paisa?: number;
}

export function useAddMember(messId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddMemberPayload) =>
      unwrap<Member>(await apiClient.post(`/api/messes/${messId}/members`, payload)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(messId) }),
  });
}

export interface UpdateMemberPayload {
  display_name?: string;
  joined_on?: string;
  left_on?: string | null;
}

export function useUpdateMember(messId: number, memberId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateMemberPayload) =>
      unwrap<Member>(await apiClient.patch(`/api/messes/${messId}/members/${memberId}`, payload)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(messId) }),
  });
}

export function useArchiveMember(messId: number, memberId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap<Member>(await apiClient.post(`/api/messes/${messId}/members/${memberId}/archive`)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(messId) }),
  });
}

export function useInvites(messId: number, enabled: boolean) {
  return useQuery({
    queryKey: invitesKey(messId),
    enabled,
    queryFn: async () => unwrap<Invite[]>(await apiClient.get(`/api/messes/${messId}/invites`)),
  });
}

export interface CreateInvitePayload {
  member_id?: number;
  expires_in_days?: number;
  max_uses?: number;
}

export function useCreateInvite(messId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateInvitePayload) =>
      unwrap<Invite>(await apiClient.post(`/api/messes/${messId}/invites`, payload)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(messId) }),
  });
}

export function useRevokeInvite(messId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: number) => apiClient.delete(`/api/messes/${messId}/invites/${inviteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(messId) }),
  });
}

function useRoleMutation(messId: number, path: "admin" | "manager") {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: number) =>
      unwrap<Mess>(await apiClient.post(`/api/messes/${messId}/${path}`, { member_id: memberId })),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: membersKey(messId) }),
        queryClient.invalidateQueries({ queryKey: messDetailKey(messId) }),
        queryClient.invalidateQueries({ queryKey: meQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["auth", "session"] }),
      ]);
    },
  });
}

export const useTransferAdmin = (messId: number) => useRoleMutation(messId, "admin");
export const useAssignManager = (messId: number) => useRoleMutation(messId, "manager");
