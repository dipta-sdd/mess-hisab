"use client";

import { Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { messHomePath } from "@/features/mess/api";
import { ErrorAlert, useApiErrorText } from "@/features/mess/ui/errors";
import { useSession } from "../api";

/** "/": signed out -> login; one mess -> that mess; none or several -> the mess picker / creator. */
export function Landing() {
  const t = useTranslations("auth");
  const router = useRouter();
  const session = useSession();
  const errorText = useApiErrorText();

  useEffect(() => {
    if (session.data === undefined) return;
    if (session.data === null) {
      router.replace("/login");
      return;
    }
    const { memberships } = session.data;
    router.replace(memberships.length === 1 && memberships[0] ? messHomePath(memberships[0].mess_id) : "/onboarding");
  }, [session.data, router]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center p-6">
      {session.isError ? (
        <ErrorAlert message={errorText(session.error)} />
      ) : (
        <div className="flex items-center gap-3" role="status">
          <Spinner />
          <span>{t("callback.working")}</span>
        </div>
      )}
    </main>
  );
}
