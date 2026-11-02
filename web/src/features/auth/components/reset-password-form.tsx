"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorAlert, SuccessAlert, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { useResetPassword } from "../api";
import { AuthCard, linkClass } from "./auth-card";

const schema = z
  .object({
    email: z.string().trim().min(1, "v:required").email("v:email"),
    password: z.string().min(8, "v:passwordMin"),
    password_confirmation: z.string().min(1, "v:required"),
  })
  .refine((v) => v.password === v.password_confirmation, {
    path: ["password_confirmation"],
    message: "v:passwordMismatch",
  });
type Values = z.infer<typeof schema>;

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: params.get("email") ?? "", password: "", password_confirmation: "" },
  });
  // The API reports a bad/expired token on "email"; "token" has no input, so it goes to the alert.
  const form = useFormError<Values>(setError, (field) => (field === "token" ? null : field));

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      await reset.mutateAsync({ ...values, token });
      setDone(true);
    } catch (error) {
      form.handle(error);
    }
  });

  if (!token) {
    return (
      <AuthCard
        title={t("reset.title")}
        footer={
          <Link href="/forgot-password" className={linkClass}>
            {t("reset.requestNew")}
          </Link>
        }
      >
        <ErrorAlert message={t("reset.missingToken")} />
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title={t("reset.title")}>
        <SuccessAlert message={t("reset.done")} />
        <Link href="/login" className={linkClass}>
          {t("reset.goToLogin")}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("reset.title")}
      subtitle={t("reset.subtitle")}
      footer={
        <Link href="/login" className={linkClass}>
          {t("backToLogin")}
        </Link>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorAlert message={form.message} />
        <TextInputField
          label={t("fields.email")}
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register("email")}
        />
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
