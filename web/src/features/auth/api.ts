import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Locale, OtpSent, User } from "@/lib/api/contract";
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
  /** A phone (any accepted form) or an email. */
  login: string;
  password: string;
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
  phone: string;
  email?: string;
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

/** (Re)sends the verify code to the signed-in user's unverified phone. */
export function useSendPhoneCode() {
  return useMutation({
    mutationFn: async () => unwrap<OtpSent>(await apiClient.post("/api/auth/phone/send", {})),
  });
}

export function useVerifyPhone() {
  const refresh = useRefreshSession();
  return useMutation({
    mutationFn: async (code: string) => unwrap<User>(await apiClient.post("/api/auth/phone/verify", { code })),
    onSuccess: refresh,
  });
}

/** Forgot password, step 1: sends a reset code (always 202, no account enumeration). */
export function useSendResetCode() {
  return useMutation({
    mutationFn: (phone: string) => apiClient.post("/api/auth/password/phone", { phone }),
  });
}

/** Step 2: trade the code for a single-use reset token. */
export function useVerifyResetCode() {
  return useMutation({
    mutationFn: async (payload: { phone: string; code: string }) =>
      unwrap<{ reset_token: string }>(await apiClient.post("/api/auth/password/phone/verify", payload)),
  });
}

export interface PhoneResetPayload {
  phone: string;
  reset_token: string;
  password: string;
  password_confirmation: string;
}

/** Step 3: set the new password. */
export function usePhoneReset() {
  return useMutation({
    mutationFn: (payload: PhoneResetPayload) => apiClient.post("/api/auth/password/phone/reset", payload),
  });
}

export interface ResetPasswordPayload {
  token: string;
  email: string;
  password: string;
  password_confirmation: string;
}

/** Legacy email reset: the page stays reachable but is no longer linked. */
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
