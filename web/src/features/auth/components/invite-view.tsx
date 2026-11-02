"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { messHomePath } from "@/features/mess/api";
import { ErrorAlert, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { isApiError } from "@/lib/api-client/errors";
import { useAcceptInvite, useInvitePreview, useSession } from "../api";
import { AuthCard, linkClass } from "./auth-card";

const schema = z.object({ display_name: z.string().trim().max(100, "v:tooLong") });
type Values = z.infer<typeof schema>;

const REASONS = ["revoked", "expired", "used_up", "member_unavailable"];

export function InviteView({ token }: { token: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const preview = useInvitePreview(token);
  const session = useSession();
  const accept = useAcceptInvite(token);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { display_name: "" } });
  const form = useFormError<Values>(setError);

  if (preview.isPending || session.isPending) {
    return (
      <AuthCard title={t("invite.title")}>
        <div className="flex items-center gap-3" role="status">
          <Spinner />
          <span>{t("invite.loading")}</span>
        </div>
      </AuthCard>
    );
  }

  const notFound = preview.isError && isApiError(preview.error) && preview.error.isNotFound;
  if (preview.isError && !notFound) {
    return (
      <AuthCard title={t("invite.title")}>
        <ErrorAlert message={t("invite.loadFailed")} />
      </AuthCard>
    );
  }

  if (notFound || !preview.data?.valid) {
    const reason = preview.data?.reason;
    const key = reason && REASONS.includes(reason) ? reason : "notFound";
    return (
      <AuthCard
        title={t("invite.invalidTitle")}
        footer={
          <Link href="/" className={linkClass}>
            {t("invite.goHome")}
          </Link>
        }
      >
        <ErrorAlert message={t(`invite.reason.${key}`)} />
      </AuthCard>
    );
  }

  const data = preview.data;
  const heading = (
    <>
      <p className="text-base">{t("invite.joining", { mess: data.mess_name })}</p>
      {data.member_display_name ? (
        <p className="text-sm text-muted">{t("invite.forMember", { name: data.member_display_name })}</p>
      ) : null}
    </>
  );

  if (!session.data) {
    const next = encodeURIComponent(`/invite/${token}`);
    return (
      <AuthCard title={t("invite.title")} subtitle={t("invite.signInFirst")}>
        {heading}
        <Link
          href={`/login?next=${next}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 font-medium text-accent-foreground"
        >
          {t("invite.signIn")}
        </Link>
        <Link
          href={`/register?next=${next}`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 font-medium"
        >
          {t("invite.register")}
        </Link>
      </AuthCard>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      const name = values.display_name.trim();
      const result = await accept.mutateAsync(name ? { display_name: name } : {});
      router.replace(messHomePath(result.mess_id));
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <AuthCard
      title={t("invite.title")}
      subtitle={t("invite.signedInAs", { name: session.data.user.name })}
      footer={
        <Link href="/" className={linkClass}>
          {t("invite.goHome")}
        </Link>
      }
    >
      {heading}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <ErrorAlert message={form.message} />
        <TextInputField
          label={t("invite.displayName")}
          description={t("invite.displayNameHint")}
          placeholder={data.member_display_name ?? session.data.user.name}
          error={errors.display_name?.message}
          {...register("display_name")}
        />
        <Button type="submit" variant="primary" fullWidth isPending={accept.isPending}>
          {t("invite.accept")}
        </Button>
      </form>
    </AuthCard>
  );
}
