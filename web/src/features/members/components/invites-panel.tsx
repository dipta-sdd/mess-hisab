"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Invite, Member } from "@/lib/api/contract";
import { ErrorAlert, SuccessAlert, useApiErrorText, useFormError } from "@/features/mess/ui/errors";
import { SelectField, TextInputField } from "@/features/mess/ui/fields";
import { formatDate, formatNumber } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";
import { useMess } from "@/lib/mess/mess-context";
import { useCreateInvite, useInvites, useRevokeInvite } from "../api";

const schema = z.object({
  member_id: z.string(),
  expires_in_days: z.string().refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 365), "v:range_1_365"),
  max_uses: z.string().refine((v) => v === "" || (/^\d+$/.test(v) && +v >= 1 && +v <= 1000), "v:range_1_1000"),
});
type Values = z.infer<typeof schema>;

function inviteStatus(invite: Invite): "revoked" | "expired" | "usedUp" | "active" {
  if (invite.revoked_at) return "revoked";
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return "expired";
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) return "usedUp";
  return "active";
}

function InviteRow({ invite, members }: { invite: Invite; members: Member[] }) {
  const t = useTranslations("members");
  const locale = useLocale() as AppLocale;
  const { messId } = useMess();
  const revoke = useRevokeInvite(messId);
  const errorText = useApiErrorText();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = inviteStatus(invite);
  const forMember = members.find((m) => m.id === invite.member_id);

  const link =
    invite.url && invite.url.startsWith("http")
      ? invite.url
      : `${typeof window === "undefined" ? "" : window.location.origin}/invite/${invite.token}`;

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError(t("invites.copyFailed"));
    }
  };

  const onRevoke = async () => {
    setError(null);
    try {
      await revoke.mutateAsync(invite.id);
    } catch (err) {
      setError(errorText(err));
    }
  };

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0 break-all text-sm font-medium">
          {forMember ? t("invites.forMember", { name: forMember.display_name }) : t("invites.forAnyone")}
        </span>
        <span className="text-xs text-muted">{t(`invites.status.${status}`)}</span>
      </div>
      <p className="text-xs text-muted">
        {t("invites.uses", { uses: formatNumber(invite.uses, locale), max: invite.max_uses == null ? t("invites.unlimited") : formatNumber(invite.max_uses, locale) })}
        {invite.expires_at ? ` · ${t("invites.expires", { date: formatDate(invite.expires_at.slice(0, 10), locale) })}` : ""}
      </p>
      <ErrorAlert message={error} />
      {copied ? <SuccessAlert message={t("invites.copied")} /> : null}
      {status === "active" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onPress={copy}>
            {t("invites.copy")}
          </Button>
          <Button variant="danger-soft" size="sm" isPending={revoke.isPending} onPress={onRevoke}>
            {t("invites.revoke")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export function InvitesPanel({ members }: { members: Member[] }) {
  const t = useTranslations("members");
  const { messId } = useMess();
  const invites = useInvites(messId, true);
  const create = useCreateInvite(messId);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { member_id: "", expires_in_days: "", max_uses: "" },
  });
  const form = useFormError<Values>(setError);

  // Placeholders only: members without an account who are not archived.
  const placeholders = members.filter((m) => !m.has_account && !m.archived_at);

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      await create.mutateAsync({
        ...(values.member_id ? { member_id: Number(values.member_id) } : {}),
        ...(values.expires_in_days ? { expires_in_days: Number(values.expires_in_days) } : {}),
        ...(values.max_uses ? { max_uses: Number(values.max_uses) } : {}),
      });
      reset();
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title className="text-lg font-semibold">{t("invites.title")}</Card.Title>
        <Card.Description>{t("invites.hint")}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        <form onSubmit={onSubmit} noValidate aria-label={t("invites.create")} className="flex flex-col gap-3">
          <ErrorAlert message={form.message} />
          <SelectField label={t("invites.member")} error={errors.member_id?.message} {...register("member_id")}>
            <option value="">{t("invites.anyone")}</option>
            {placeholders.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </SelectField>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInputField
              label={t("invites.expiresInDays")}
              inputMode="numeric"
              error={errors.expires_in_days?.message}
              {...register("expires_in_days")}
            />
            <TextInputField
              label={t("invites.maxUses")}
              inputMode="numeric"
              error={errors.max_uses?.message}
              {...register("max_uses")}
            />
          </div>
          <div>
            <Button type="submit" variant="primary" className="w-full sm:w-auto" isPending={create.isPending}>
              {t("invites.create")}
            </Button>
          </div>
        </form>
        {invites.isError ? <ErrorAlert message={t("invites.loadFailed")} /> : null}
        {invites.data && invites.data.length === 0 ? <p className="text-sm text-muted">{t("invites.empty")}</p> : null}
        <ul className="flex flex-col gap-2">
          {(invites.data ?? []).map((invite) => (
            <InviteRow key={invite.id} invite={invite} members={members} />
          ))}
        </ul>
      </Card.Content>
    </Card.Root>
  );
}
