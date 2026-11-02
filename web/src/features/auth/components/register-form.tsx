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
import { GOOGLE_SIGN_IN_ENABLED } from "../config";
import { safeNext } from "../next-path";
import { stashResendFromNow } from "../otp";
import { PHONE_INVALID, isBdMobile, phoneForApi } from "../phone";
import { AuthCard, linkClass } from "./auth-card";
import { useAuthFieldMessage } from "./code-form";
import { GoogleButton } from "./google-button";

const schema = z
  .object({
    name: z.string().trim().min(1, "v:required").max(100, "v:tooLong"),
    phone: z.string().trim().min(1, "v:required").refine(isBdMobile, PHONE_INVALID),
    email: z.union([z.literal(""), z.string().trim().email("v:email")]),
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
  const fieldMessage = useAuthFieldMessage();
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
      phone: "",
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
      const { email, phone, ...rest } = values;
      await registerUser.mutateAsync({ ...rest, phone: phoneForApi(phone), ...(email.trim() ? { email: email.trim() } : {}) });
      // Register already sent the first code; the API makes us wait before asking for another.
      stashResendFromNow();
      if (values.locale !== current) {
        writeLocaleCookie(values.locale);
        router.refresh();
      }
      router.replace(`/verify-phone${nextQuery}`);
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
          label={t("fields.phone")}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          description={t("fields.phoneHint")}
          error={fieldMessage(errors.phone?.message)}
          {...register("phone")}
        />
        <TextInputField
          label={t("fields.emailOptional")}
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
      {GOOGLE_SIGN_IN_ENABLED ? <GoogleButton next={next} /> : null}
    </AuthCard>
  );
}
