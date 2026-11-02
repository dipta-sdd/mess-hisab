"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { AppLocale } from "@/i18n/config";
import { ErrorAlert, SuccessAlert, useApiErrorText } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { localizeDigits, toLatinDigits } from "@/lib/format";
import { isApiError } from "@/lib/api-client/errors";
import { otpErrorCode, retryAfterSeconds } from "../otp";
import { useCountdown } from "../use-countdown";

/** Schema messages starting "a:" translate through auth.validation; "v:" ones through the field itself. */
export function useAuthFieldMessage() {
  const t = useTranslations("auth");
  return (message?: string): string | undefined => {
    if (message?.startsWith("a:")) return t(`validation.${message.slice(2)}`);
    return message;
  };
}

/** Translates SMS/code failures (otp_invalid, sms_failed, ...) and falls back to the shared API error text. */
export function useOtpErrorText() {
  const t = useTranslations("auth");
  const fallback = useApiErrorText();
  return (error: unknown): string => {
    const code = otpErrorCode(error);
    if (code) return t(`otp.${code}`);
    if (isApiError(error) && error.status === 429) return t("otp.throttled");
    return fallback(error);
  };
}

const schema = z.object({ code: z.string().transform(toLatinDigits).pipe(z.string().regex(/^\d{6}$/, "a:code")) });
type Values = z.input<typeof schema>;

function mmss(total: number, locale: AppLocale): string {
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return localizeDigits(`${m}:${s}`, locale);
}

/**
 * The 6-digit code step shared by verify-phone, forgot password and the phone-change card.
 * `onResend` returns the epoch ms when the next resend is allowed.
 */
export function CodeForm({
  submitLabel,
  onSubmit,
  onResend,
  initialResendAt = null,
}: {
  submitLabel: string;
  onSubmit: (code: string) => Promise<void>;
  onResend: () => Promise<number>;
  initialResendAt?: number | null;
}) {
  const t = useTranslations("auth");
  const locale = useLocale() as AppLocale;
  const errorText = useOtpErrorText();
  const fieldMessage = useAuthFieldMessage();
  const countdown = useCountdown(initialResendAt);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resending, setResending] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { code: "" } });

  const submit = handleSubmit(async (values) => {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await onSubmit(toLatinDigits(values.code));
    } catch (e) {
      setError(errorText(e));
      reset({ code: "" });
    } finally {
      setPending(false);
    }
  });

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      countdown.startAt(await onResend());
      setNotice(t("otp.resent"));
    } catch (e) {
      const wait = retryAfterSeconds(e);
      if (otpErrorCode(e) === "otp_resend_wait" && wait) countdown.startFor(wait);
      setError(errorText(e));
    } finally {
      setResending(false);
    }
  };

  const waiting = countdown.seconds > 0;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <ErrorAlert message={error} />
        <SuccessAlert message={notice} />
        <TextInputField
          label={t("fields.code")}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder={localizeDigits("000000", locale)}
          description={t("fields.codeHint")}
          error={fieldMessage(errors.code?.message)}
          {...register("code")}
        />
        <Button type="submit" variant="primary" fullWidth isPending={pending}>
          {submitLabel}
        </Button>
      </form>
      <Button type="button" variant="outline" fullWidth isDisabled={waiting || resending} onPress={resend}>
        {waiting ? t("otp.resendIn", { time: mmss(countdown.seconds, locale) }) : t("otp.resend")}
      </Button>
    </div>
  );
}
