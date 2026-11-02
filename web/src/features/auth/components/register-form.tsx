"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { isLocale, locales, type AppLocale } from "@/i18n/config";
import { writeLocaleCookie } from "@/lib/i18n/language-switcher";
import { ErrorAlert, useFormError } from "@/features/mess/ui/errors";
import { SelectField, TextInputField } from "@/features/mess/ui/fields";
import { useRegister } from "../api";
import { safeNext } from "../next-path";
import { AuthCard, linkClass } from "./auth-card";
import { GoogleButton } from "./login-form";

const schema = z
  .object({
    name: z.string().trim().min(1, "v:required").max(100, "v:tooLong"),
    email: z.string().trim().min(1, "v:required").email("v:email"),
    password: z.string().min(8, "v:passwordMin"),
    password_confirmation: z.string().min(1, "v:required"),
    locale: z.enum(locales),
  })
  .refine((v) => v.password === v.password_confirmation, {
    path: ["password_confirmation"],
    message: "v:passwordMismatch",
  });
type Values = z.infer<typeof schema>;

const LANGUAGE_NAMES: Record<AppLocale, string> = { en: "English", bn: "বাংলা" };

export function RegisterForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const current = useLocale();
  const registerUser = useRegister();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      password_confirmation: "",
      locale: isLocale(current) ? current : "en",
    },
  });
  const form = useFormError<Values>(setError);
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      await registerUser.mutateAsync(values);
      if (values.locale !== current) {
        writeLocaleCookie(values.locale);
        router.refresh();
      }
      router.replace(next ?? "/");
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <AuthCard
      title={t("register.title")}
      subtitle={t("register.subtitle")}
      footer={
        <p>
          {t("register.haveAccount")}{" "}
          <Link href={`/login${nextQuery}`} className={linkClass}>
            {t("register.login")}
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorAlert message={form.message} />
        <TextInputField label={t("fields.name")} autoComplete="name" error={errors.name?.message} {...register("name")} />
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
        <SelectField label={t("fields.language")} error={errors.locale?.message} {...register("locale")}>
          {locales.map((locale) => (
            <option key={locale} value={locale} lang={locale}>
              {LANGUAGE_NAMES[locale]}
            </option>
          ))}
        </SelectField>
        <Button type="submit" variant="primary" fullWidth isPending={registerUser.isPending}>
          {t("register.submit")}
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
