"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorAlert, SuccessAlert, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { useForgotPassword } from "../api";
import { AuthCard, linkClass } from "./auth-card";

const schema = z.object({ email: z.string().trim().min(1, "v:required").email("v:email") });
type Values = z.infer<typeof schema>;

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const forgot = useForgotPassword();
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "" } });
  const form = useFormError<Values>(setError);

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      await forgot.mutateAsync(values);
      setSent(true);
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <AuthCard
      title={t("forgot.title")}
      subtitle={t("forgot.subtitle")}
      footer={
        <Link href="/login" className={linkClass}>
          {t("backToLogin")}
        </Link>
      }
    >
      {sent ? <SuccessAlert message={t("forgot.sent")} /> : null}
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
        <Button type="submit" variant="primary" fullWidth isPending={forgot.isPending}>
          {t("forgot.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
