"use client";

import { Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/nav";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchSession, sessionQueryKey } from "../api";
import { meQueryKey } from "@/lib/api-client/auth";
import { takeStashedNext } from "../next-path";
import { AuthCard } from "./auth-card";

/** /auth/callback?status=ok|error - where the API sends the browser after Google sign-in. */
export function GoogleCallback() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status");
  const queryClient = useQueryClient();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (status !== "ok") {
      router.replace("/login?error=google");
      return;
    }
    void (async () => {
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      const session = await fetchSession().catch(() => null);
      if (!session) {
        router.replace("/login?error=google");
        return;
      }
      queryClient.setQueryData(sessionQueryKey, session);
      router.replace(takeStashedNext() ?? "/");
    })();
  }, [status, router, queryClient]);

  return (
    <AuthCard title={t("callback.title")}>
      <div className="flex items-center gap-3" role="status">
        <Spinner />
        <span>{t("callback.working")}</span>
      </div>
    </AuthCard>
  );
}
