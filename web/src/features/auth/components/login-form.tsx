"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { TextInputField } from "@/features/mess/ui/fields";
import { ErrorAlert, useFormError } from "@/features/mess/ui/errors";
import { useLogin } from "../api";
import { GOOGLE_SIGN_IN_ENABLED } from "../config";
import { useSyncLocaleAfterLogin } from "../locale-sync";
import { safeNext } from "../next-path";
import { AuthCard, linkClass } from "./auth-card";
import { GoogleButton } from "./google-button";

const schema = z.object({
  login: z.string().trim().min(1, "v:required"),
  password: z.string().min(1, "v:required"),
});
type Values = z.infer<typeof schema>;

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
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { login: "", password: "" } });
  const form = useFormError<Values>(setError);

  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const googleError = GOOGLE_SIGN_IN_ENABLED && params.get("error") === "google" ? t("login.googleError") : null;

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      const user = await login.mutateAsync(values);
      syncLocale(user);
      // A locked account (no verified phone yet) can only use the verify screen.
      if (user.has_verified_contact === false) router.replace(`/verify-phone${nextQuery}`);
      else router.replace(next ?? "/");
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <AuthCard
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <p>
          {t("login.noAccount")}{" "}
          <Link href={`/register${nextQuery}`} className={linkClass}>
            {t("login.register")}
          </Link>
        </p>
      }
    >
      <ErrorAlert message={googleError} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorAlert message={form.message} />
        <TextInputField
          label={t("fields.login")}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          error={errors.login?.message}
          {...register("login")}
        />
        <TextInputField
          label={t("fields.password")}
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register("password")}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/forgot-password" className={`${linkClass} inline-flex min-h-11 items-center text-sm`}>
            {t("login.forgot")}
          </Link>
        </div>
        <Button type="submit" variant="primary" fullWidth isPending={login.isPending}>
          {t("login.submit")}
        </Button>
      </form>
      {GOOGLE_SIGN_IN_ENABLED ? <GoogleButton next={next} /> : null}
    </AuthCard>
  );
}
