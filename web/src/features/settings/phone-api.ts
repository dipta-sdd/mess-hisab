import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OtpSent, User } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client/client";
import { meQueryKey } from "@/lib/api-client/auth";
import { unwrap } from "@/features/mess/api";

/** Sends a `change` code to the NEW number; the current phone stays until it is confirmed. */
export function useSendPhoneChange() {
  return useMutation({
    mutationFn: async (phone: string) => unwrap<OtpSent>(await apiClient.post("/api/auth/me/phone", { phone })),
  });
}

export function useConfirmPhoneChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { phone: string; code: string }) =>
      unwrap<User>(await apiClient.post("/api/auth/me/phone/verify", payload)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: meQueryKey }),
  });
}
