import { useQuery } from "@tanstack/react-query";
import type { Membership, User } from "@/lib/api/contract";
import { apiClient } from "./client";

export interface MeResponse {
  user: User;
  memberships: Membership[];
}

export const meQueryKey = ["auth", "me"] as const;

/** GET /api/auth/me. Accepts both `{user, memberships}` and a `{data: ...}` envelope. */
export async function fetchMe(): Promise<MeResponse> {
  const body = await apiClient.get<MeResponse | { data: MeResponse }>("/api/auth/me");
  return body && "data" in body ? body.data : (body as MeResponse);
}

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, staleTime: 60_000 });
}
