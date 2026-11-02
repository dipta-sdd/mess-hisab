"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Member } from "@/lib/api/contract";
import { useMessRoles } from "@/features/mess/api";
import { isoDate, requiredName } from "@/features/mess/schemas";
import { ErrorAlert, useApiErrorText, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { FinalSettlementAction } from "@/features/settlement";
import { useMess } from "@/lib/mess/mess-context";
import { useArchiveMember, useUpdateMember } from "../api";

const schema = z.object({
  display_name: requiredName,
  joined_on: isoDate,
  left_on: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "v:invalidDate"),
});
type Values = z.infer<typeof schema>;

function EditMemberForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const t = useTranslations("members");
  const { messId } = useMess();
  const update = useUpdateMember(messId, member.id);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: member.display_name, joined_on: member.joined_on, left_on: member.left_on ?? "" },
  });
  const form = useFormError<Values>(setError);

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    try {
      await update.mutateAsync({
        display_name: values.display_name.trim(),
        joined_on: values.joined_on,
        left_on: values.left_on === "" ? null : values.left_on,
      });
      onDone();
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t("edit.title", { name: member.display_name })}
      className="flex w-full flex-col gap-3 rounded-xl border border-border p-3"
    >
      <ErrorAlert message={form.message} />
      <TextInputField label={t("fields.displayName")} error={errors.display_name?.message} {...register("display_name")} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInputField label={t("fields.joinedOn")} type="date" error={errors.joined_on?.message} {...register("joined_on")} />
        <TextInputField label={t("fields.leftOn")} type="date" error={errors.left_on?.message} {...register("left_on")} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" className="w-full sm:w-auto" isPending={update.isPending}>
          {t("edit.save")}
        </Button>
        <Button type="button" variant="ghost" onPress={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Per-row actions of the members list. W7 extends this slot (e.g. final settlement), so keep the
 * `{ member }` prop stable. Renders nothing for people who cannot manage members.
 */
export function MemberRowActions({ member }: { member: Member }) {
  const t = useTranslations("members");
  const { messId } = useMess();
  const roles = useMessRoles(messId);
  const archive = useArchiveMember(messId, member.id);
  const errorText = useApiErrorText();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!roles.canManage || member.archived_at) return null;

  const onArchive = async () => {
    setError(null);
    try {
      await archive.mutateAsync();
      setConfirming(false);
    } catch (err) {
      setError(errorText(err));
      setConfirming(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      <ErrorAlert message={error} />
      {editing ? (
        <EditMemberForm member={member} onDone={() => setEditing(false)} />
      ) : confirming ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("archive.confirmGroup")}>
          <span className="text-sm">{t("archive.confirm", { name: member.display_name })}</span>
          <Button variant="danger" size="sm" isPending={archive.isPending} onPress={onArchive}>
            {t("archive.yes")}
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={t("edit.aria", { name: member.display_name })}
            onPress={() => {
              setError(null);
              setEditing(true);
            }}
          >
            {t("edit.button")}
          </Button>
          <Button
            variant="danger-soft"
            size="sm"
            aria-label={t("archive.aria", { name: member.display_name })}
            onPress={() => {
              setError(null);
              setConfirming(true);
            }}
          >
            {t("archive.button")}
          </Button>
          <FinalSettlementAction member={member} />
        </div>
      )}
    </div>
  );
}
