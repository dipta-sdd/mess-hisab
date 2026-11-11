"use client";

import { Button, Spinner } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/i18n/config";
import { ErrorAlert } from "@/features/mess/ui/errors";
import { localizeDigits } from "@/lib/format";
import { useMe } from "@/lib/api-client/auth";
import { useLogout, useSendPhoneCode, useVerifyPhone } from "../api";
import { safeNext } from "../next-path";
import { readResendAt, retryAfterSeconds, stashResendAt } from "../otp";
import { AuthCard } from "./auth-card";
import { CodeForm, useOtpErrorText } from "./code-form";

export function VerifyPhoneForm() {
  const t = useTranslations("auth");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const me = useMe();
  const send = useSendPhoneCode();
  const verify = useVerifyPhone();
  const logout = useLogout();
  const errorText = useOtpErrorText();
  const [initialResendAt] = useState(readResendAt);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState<number | null>(initialResendAt);
  const sentOnce = useRef(false);

  const user = me.data?.user;
  const verified = user?.has_verified_contact === true;

  useEffect(() => {
    if (verified) router.replace(next ?? "/");
  }, [verified, next, router]);

  // Arrived without a fresh code (e.g. a locked account just logged in): ask for one.
  const needsCode = !!user && !verified && initialResendAt === null;
  useEffect(() => {
    if (!needsCode || sentOnce.current) return;
    sentOnce.current = true;
    send.mutateAsync().then(
      (sent) => {
        const at = Date.parse(sent.resend_at);
        stashResendAt(at);
        setResendAt(at);
      },
      (error) => {
        const wait = retryAfterSeconds(error);
        if (wait) setResendAt(Date.now() + wait * 1000);
        else setStartupError(errorText(error));
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsCode]);

  if (me.isPending || verified || !user) {
    return (
      <div className="flex items-center justify-center gap-3 py-10" role="status">
        <Spinner />
        <span>{t("callback.working")}</span>
      </div>
    );
  }

  const phone = user.phone ? localizeDigits(user.phone, locale) : "";

  return (
    <AuthCard
      title={t("verify.title")}
      subtitle={t("verify.subtitle", { phone })}
      footer={
        <Button
          type="button"
          variant="ghost"
          isPending={logout.isPending}
          onPress={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
        >
          {t("verify.logout")}
        </Button>
      }
    >
      <ErrorAlert message={startupError} />
      <CodeForm
        key={resendAt ?? "none"}
        submitLabel={t("verify.submit")}
        initialResendAt={resendAt}
        onSubmit={async (code) => {
          await verify.mutateAsync(code);
          router.replace(next ?? "/");
        }}
        onResend={async () => {
          const sent = await send.mutateAsync();
          const at = Date.parse(sent.resend_at);
          stashResendAt(at);
          return at;
        }}
      />
    </AuthCard>
  );
}
