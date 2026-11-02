import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Locale, User } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client/client";
import { isApiError } from "@/lib/api-client/errors";
import { meQueryKey, type MeResponse } from "@/lib/api-client/auth";
import { unwrap } from "@/features/mess/api";

export const sessionQueryKey = ["auth", "session"] as const;

/**
 * GET /api/auth/me without the global "redirect to /login on 401". Resolves to null when
 * signed out, so pages that work both ways (invite, landing) can branch on it.
 */
export async function fetchSession(): Promise<MeResponse | null> {
  try {
    return unwrap<MeResponse>(await apiClient.get("/api/auth/me", { skipUnauthorized: true }));
  } catch (error) {
    if (isApiError(error) && error.isUnauthorized) return null;
    throw error;
  }
}

export function useSession() {
  return useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession, staleTime: 30_000 });
}

export function useRefreshSession() {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionQueryKey }),
      queryClient.invalidateQueries({ queryKey: meQueryKey }),
    ]);
  };
}

export interface LoginPayload {
  email: string;
  password: string;
  remember?: boolean;
}

export function useLogin() {
  const refresh = useRefreshSession();
  return useMutation({
    mutationFn: async (payload: LoginPayload) => unwrap<User>(await apiClient.post("/api/auth/login", payload)),
    onSuccess: refresh,
  });
}

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
  locale: Locale;
}

export function useRegister() {
  const refresh = useRefreshSession();
  return useMutation({
    mutationFn: async (payload: RegisterPayload) => unwrap<User>(await apiClient.post("/api/auth/register", payload)),
    onSuccess: refresh,
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (payload: { email: string }) => apiClient.post("/api/auth/forgot-password", payload),
  });
}

export interface ResetPasswordPayload {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (payload: ResetPasswordPayload) => apiClient.post("/api/auth/reset-password", payload),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post("/api/auth/logout"),
    onSuccess: () => queryClient.clear(),
  });
}

export interface InvitePreview {
  mess_name: string;
  member_display_name?: string;
  valid: boolean;
  reason?: string;
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ["invite", token],
    queryFn: async () => unwrap<InvitePreview>(await apiClient.get(`/api/invites/${encodeURIComponent(token)}`)),
    retry: false,
  });
}

export function useAcceptInvite(token: string) {
  const refresh = useRefreshSession();
  return useMutation({
    mutationFn: async (payload: { display_name?: string }) =>
      unwrap<{ mess_id: number; member_id: number }>(
        await apiClient.post(`/api/invites/${encodeURIComponent(token)}/accept`, payload),
      ),
    onSuccess: refresh,
  });
}
