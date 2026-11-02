import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Mess } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client/client";
import { messDetailKey, unwrap } from "@/features/mess/api";

export type SettingsPayload = Partial<Omit<Mess, "id" | "admin_member_id" | "manager_member_id">>;

export function useUpdateSettings(messId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SettingsPayload) =>
      unwrap<Mess>(await apiClient.patch(`/api/messes/${messId}/settings`, payload)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messDetailKey(messId) }),
  });
}
