"use client";

import { Spinner } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { isApiError } from "@/lib/api-client/errors";
import { useMe } from "@/lib/api-client/auth";

export const VERIFY_PHONE_PATH = "/verify-phone";

function isPhoneUnverified(error: unknown): boolean {
  return isApiError(error) && error.isForbidden && error.code === "phone_unverified";
}

/**
 * Locks the signed-in app behind a verified phone: a user without `has_verified_contact` is sent to
 * /verify-phone and nothing underneath renders. Also reacts to a 403 `phone_unverified` from any
 * query or mutation (e.g. the account was locked while the tab was open).
 */
export function PhoneGate({ children }: { children: ReactNode }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const locked = me.data?.user.has_verified_contact === false;

  useEffect(() => {
    if (locked) router.replace(VERIFY_PHONE_PATH);
  }, [locked, router]);

  useEffect(() => {
    const check = (event: { type: string; action?: { type?: string; error?: unknown } }) => {
      if (event.type === "updated" && event.action?.type === "error" && isPhoneUnverified(event.action.error)) {
        router.replace(VERIFY_PHONE_PATH);
      }
    };
    const offQueries = queryClient.getQueryCache().subscribe(check);
    const offMutations = queryClient.getMutationCache().subscribe(check);
    return () => {
      offQueries();
      offMutations();
    };
  }, [queryClient, router]);

  if (me.isPending || locked) {
    return (
      <div className="flex items-center justify-center gap-3 py-10" role="status">
        <Spinner />
        <span>{t("callback.working")}</span>
      </div>
    );
  }
  return <>{children}</>;
}
