"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, buttonVariants } from "@heroui/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { API_BASE_URL } from "@/lib/api-client/client";
import { CheckboxField, TextInputField } from "@/features/mess/ui/fields";
import { ErrorAlert, useFormError } from "@/features/mess/ui/errors";
import { useLogin } from "../api";
import { useSyncLocaleAfterLogin } from "../locale-sync";
import { safeNext, stashNext } from "../next-path";
import { AuthCard, linkClass } from "./auth-card";

const schema = z.object({
  email: z.string().trim().min(1, "v:required").email("v:email"),
  password: z.string().min(1, "v:required"),
  remember: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function GoogleButton({ next }: { next: string | null }) {
  const t = useTranslations("auth");
  return (
    <a
      href={`${API_BASE_URL}/api/auth/google/redirect`}
      onClick={() => stashNext(next)}
      className={buttonVariants({ variant: "outline", fullWidth: true })}
    >
      {t("google")}
    </a>
  );
}

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const login = useLogin();
  const syncLocale = useSyncLocaleAfterLogin();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", remember: false } });
  const form = useFormError<Values>(setError);

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const googleError = params.get("error") === "google" ? t("login.googleError") : null;

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      const user = await login.mutateAsync(values);
      syncLocale(user);
      router.replace(next ?? "/");
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <AuthCard
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          <p>
            {t("login.noAccount")}{" "}
            <Link href={`/register${nextQuery}`} className={linkClass}>
              {t("login.register")}
            </Link>
          </p>
        </>
      }
    >
      <ErrorAlert message={googleError} />
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
          label={t("fields.password")}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CheckboxField label={t("fields.remember")} {...register("remember")} />
          <Link href="/forgot-password" className={`${linkClass} text-sm`}>
            {t("login.forgot")}
          </Link>
        </div>
        <Button type="submit" variant="primary" fullWidth isPending={login.isPending}>
          {t("login.submit")}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <GoogleButton next={next} />
    </AuthCard>
  );
}
