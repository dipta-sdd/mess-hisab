"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { AppLocale } from "@/i18n/config";
import { ErrorAlert, SuccessAlert, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { localizeDigits } from "@/lib/format";
import { isApiError } from "@/lib/api-client/errors";
import { usePhoneReset, useSendResetCode, useVerifyResetCode } from "../api";
import { RESEND_GAP_MS } from "../otp";
import { PHONE_INVALID, isBdMobile, phoneForApi } from "../phone";
import { AuthCard, linkClass } from "./auth-card";
import { CodeForm, useAuthFieldMessage, useOtpErrorText } from "./code-form";

const phoneSchema = z.object({ phone: z.string().trim().min(1, "v:required").refine(isBdMobile, PHONE_INVALID) });
type PhoneValues = z.infer<typeof phoneSchema>;

const passwordSchema = z
  .object({
    password: z.string().min(8, "v:passwordMin"),
    password_confirmation: z.string().min(1, "v:required"),
  })
  .refine((v) => v.password === v.password_confirmation, {
    path: ["password_confirmation"],
    message: "v:passwordMismatch",
  });
type PasswordValues = z.infer<typeof passwordSchema>;

type Step =
  | { name: "phone" }
  | { name: "code"; phone: string; sentAt: number }
  | { name: "password"; phone: string; token: string }
  | { name: "done" };

const backLink = (label: string) => (
  <Link href="/login" className={`${linkClass} inline-flex min-h-11 items-center`}>
    {label}
  </Link>
);

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [step, setStep] = useState<Step>({ name: "phone" });

  if (step.name === "done") {
    return (
      <AuthCard title={t("forgot.title")}>
        <SuccessAlert message={t("forgot.done")} />
        <Link href="/login" className={`${linkClass} inline-flex min-h-11 items-center`}>
          {t("reset.goToLogin")}
        </Link>
      </AuthCard>
    );
  }
  if (step.name === "code") {
    const { phone, sentAt } = step;
    return <CodeStep phone={phone} sentAt={sentAt} onToken={(token) => setStep({ name: "password", phone, token })} />;
  }
  if (step.name === "password") {
    return <PasswordStep phone={step.phone} token={step.token} onDone={() => setStep({ name: "done" })} />;
  }
  return <PhoneStep onSent={(phone) => setStep({ name: "code", phone, sentAt: Date.now() + RESEND_GAP_MS })} />;
}

function PhoneStep({ onSent }: { onSent: (phone: string) => void }) {
  const t = useTranslations("auth");
  const send = useSendResetCode();
  const fieldMessage = useAuthFieldMessage();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PhoneValues>({ resolver: zodResolver(phoneSchema), defaultValues: { phone: "" } });
  const form = useFormError<PhoneValues>(setError);
  const errorText = useOtpErrorText();
  const [error, setMessage] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    setMessage(null);
    const phone = phoneForApi(values.phone);
    try {
      await send.mutateAsync(phone);
      onSent(phone);
    } catch (e) {
      // 429 / sms_failed are not field errors.
      if (isApiError(e) && e.isValidation) form.handle(e);
      else setMessage(errorText(e));
    }
  });

  return (
    <AuthCard title={t("forgot.title")} subtitle={t("forgot.subtitle")} footer={backLink(t("backToLogin"))}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorAlert message={error ?? form.message} />
        <TextInputField
          label={t("fields.phone")}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          description={t("fields.phoneHint")}
          error={fieldMessage(errors.phone?.message)}
          {...register("phone")}
        />
        <Button type="submit" variant="primary" fullWidth isPending={send.isPending}>
          {t("forgot.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

function CodeStep({ phone, sentAt, onToken }: { phone: string; sentAt: number; onToken: (token: string) => void }) {
  const t = useTranslations("auth");
  const locale = useLocale() as AppLocale;
  const send = useSendResetCode();
  const verify = useVerifyResetCode();

  return (
    <AuthCard
      title={t("forgot.title")}
      subtitle={t("forgot.codeSubtitle", { phone: localizeDigits(phone, locale) })}
      footer={backLink(t("backToLogin"))}
    >
      <CodeForm
        submitLabel={t("forgot.verify")}
        initialResendAt={sentAt}
        onSubmit={async (code) => {
          const { reset_token } = await verify.mutateAsync({ phone, code });
          onToken(reset_token);
        }}
        onResend={async () => {
          await send.mutateAsync(phone);
          return Date.now() + RESEND_GAP_MS;
        }}
      />
    </AuthCard>
  );
}

function PasswordStep({ phone, token, onDone }: { phone: string; token: string; onDone: () => void }) {
  const t = useTranslations("auth");
  const reset = usePhoneReset();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "", password_confirmation: "" } });
  // A bad/expired token comes back on "reset_token", which has no input: show it in the alert.
  const form = useFormError<PasswordValues>(setError, (field) => (field === "reset_token" || field === "phone" ? null : field));

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      await reset.mutateAsync({ phone, reset_token: token, ...values });
      onDone();
    } catch (e) {
      form.handle(e);
    }
  });

  return (
    <AuthCard title={t("reset.title")} subtitle={t("reset.subtitle")} footer={backLink(t("backToLogin"))}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorAlert message={form.message} />
        <TextInputField
          label={t("fields.newPassword")}
          type="password"
          autoComplete="new-password"
          description={t("fields.passwordHint")}
          error={errors.password?.message}
          {...register("password")}
        />
        <TextInputField
          label={t("fields.passwordConfirm")}
          type="password"
          autoComplete="new-password"
          error={errors.password_confirmation?.message}
          {...register("password_confirmation")}
        />
        <Button type="submit" variant="primary" fullWidth isPending={reset.isPending}>
          {t("reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
