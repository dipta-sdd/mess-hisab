"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ErrorAlert, SuccessAlert, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { apiClient } from "@/lib/api-client/client";
import { meQueryKey } from "@/lib/api-client/auth";

const emailSchema = z.object({
  email: z.string().trim().min(1, "v:required").max(255, "v:tooLong").email("v:email"),
  current_password: z.string().min(1, "v:required"),
});
type EmailValues = z.infer<typeof emailSchema>;

/** Email is a login name, so changing it asks for the current password. */
export function EmailCard({ email, hasPassword }: { email: string | null; hasPassword: boolean }) {
  const t = useTranslations("common.profile");
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, formState, setError, reset } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: email ?? "", current_password: "" },
  });
  const { message, handle, clear } = useFormError<EmailValues>(setError);

  const onSubmit = handleSubmit(async (values) => {
    clear();
    setSaved(false);
    try {
      await apiClient.patch("/api/auth/me/email", values);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      reset({ email: values.email.toLowerCase(), current_password: "" });
      setSaved(true);
    } catch (error) {
      handle(error);
    }
  });

  return (
    <Card.Root id="email" className="w-full scroll-mt-20">
      <Card.Header>
        <Card.Title className="text-lg font-semibold">{t("emailTitle")}</Card.Title>
        <Card.Description>{email ? t("emailHint") : t("emailNone")}</Card.Description>
      </Card.Header>
      <Card.Content>
        {hasPassword ? (
          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
            {saved ? <SuccessAlert message={t("emailSaved")} /> : null}
            {message ? <ErrorAlert message={message} /> : null}
            <TextInputField label={t("emailLabel")} type="email" autoComplete="email" error={formState.errors.email?.message} {...register("email")} />
            <TextInputField
              label={t("currentPassword")}
              type="password"
              autoComplete="current-password"
              error={formState.errors.current_password?.message}
              {...register("current_password")}
            />
            <div>
              <Button type="submit" isPending={formState.isSubmitting}>
                {t("emailSave")}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted">{t("emailNeedsPassword")}</p>
        )}
      </Card.Content>
    </Card.Root>
  );
}

const passwordSchema = z
  .object({
    current_password: z.string(),
    password: z.string().min(8, "v:passwordMin"),
    password_confirmation: z.string(),
  })
  .refine((v) => v.password === v.password_confirmation, { path: ["password_confirmation"], message: "v:passwordMismatch" });
type PasswordValues = z.infer<typeof passwordSchema>;

/** Change the password, or set the first one for an account that signed up with Google. */
export function PasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const t = useTranslations("common.profile");
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, formState, setError, reset } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: "", password: "", password_confirmation: "" },
  });
  const { message, handle, clear } = useFormError<PasswordValues>(setError);

  const onSubmit = handleSubmit(async (values) => {
    clear();
    setSaved(false);
    if (hasPassword && !values.current_password) {
      setError("current_password", { type: "required", message: "v:required" });
      return;
    }
    try {
      await apiClient.patch("/api/auth/me/password", values);
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      reset();
      setSaved(true);
    } catch (error) {
      handle(error);
    }
  });

  return (
    <Card.Root id="password" className="w-full scroll-mt-20">
      <Card.Header>
        <Card.Title className="text-lg font-semibold">{hasPassword ? t("passwordTitle") : t("passwordSetTitle")}</Card.Title>
        <Card.Description>{hasPassword ? t("passwordHint") : t("passwordSetHint")}</Card.Description>
      </Card.Header>
      <Card.Content>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
          {saved ? <SuccessAlert message={t("passwordSaved")} /> : null}
          {message ? <ErrorAlert message={message} /> : null}
          {hasPassword ? (
            <TextInputField
              label={t("currentPassword")}
              type="password"
              autoComplete="current-password"
              error={formState.errors.current_password?.message}
              {...register("current_password")}
            />
          ) : null}
          <TextInputField
            label={t("newPassword")}
            type="password"
            autoComplete="new-password"
            description={t("passwordRule")}
            error={formState.errors.password?.message}
            {...register("password")}
          />
          <TextInputField
            label={t("confirmPassword")}
            type="password"
            autoComplete="new-password"
            error={formState.errors.password_confirmation?.message}
            {...register("password_confirmation")}
          />
          <div>
            <Button type="submit" isPending={formState.isSubmitting}>
              {hasPassword ? t("passwordSave") : t("passwordSetSave")}
            </Button>
          </div>
        </form>
      </Card.Content>
    </Card.Root>
  );
}
