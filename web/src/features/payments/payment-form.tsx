"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { Member, Payment } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { useCreatePayment, useUpdatePayment } from "./api";
import { todayInDhaka } from "@/lib/format/date";
import { paisaToTakaInput, parseTakaToPaisa } from "@/lib/format/money-input";
import { paymentFormSchema, type PaymentFormValues } from "./schema";
import { fieldClassInvalid } from "@/components/ui/field";

/** Maps API field names to form field names. */
const SERVER_FIELDS: Record<string, keyof PaymentFormValues> = {
  member_id: "member_id",
  group: "group",
  amount_paisa: "amount",
  paid_on: "paid_on",
  note: "note",
};

export function PaymentForm({
  messId,
  members,
  payment,
  onDone,
  onCancel,
}: {
  messId: number;
  members: Member[];
  payment?: Payment;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("payments");
  const tc = useTranslations("common");
  const create = useCreatePayment(messId);
  const update = useUpdatePayment(messId);
  const [banner, setBanner] = useState<string | null>(null);
  const editing = Boolean(payment);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      member_id: payment ? String(payment.member_id) : "",
      group: payment?.group ?? "fixed",
      amount: payment ? paisaToTakaInput(payment.amount_paisa) : "",
      paid_on: payment?.paid_on ?? todayInDhaka(),
      note: payment?.note ?? "",
    },
  });

  // Archived members can't pay, except the one on a payment being edited.
  const choices = members.filter((m) => !m.archived_at || m.id === payment?.member_id);

  async function onSubmit(values: PaymentFormValues) {
    setBanner(null);
    const parsed = parseTakaToPaisa(values.amount);
    if (!parsed.ok) return;
    const input = {
      member_id: Number(values.member_id),
      group: values.group,
      amount_paisa: parsed.paisa,
      paid_on: values.paid_on,
      note: values.note.trim() === "" ? null : values.note.trim(),
    };
    try {
      if (payment) await update.mutateAsync({ id: payment.id, input });
      else await create.mutateAsync(input);
      onDone();
    } catch (error) {
      if (!isApiError(error)) return setBanner(t("errors.generic"));
      if (error.isValidation) {
        let placed = false;
        for (const [apiField, messages] of Object.entries(error.fieldErrors)) {
          const field = SERVER_FIELDS[apiField];
          if (field) {
            setError(field, { type: "server", message: messages[0] });
            placed = true;
          }
        }
        if (!placed) setBanner(error.message);
      } else if (error.isConflict && error.code === "month_closed") setBanner(t("errors.monthClosed"));
      else if (error.isForbidden) setBanner(t("errors.forbidden"));
      else setBanner(error.message || tc("errors.generic"));
    }
  }

  /** Zod messages are i18n keys; server messages are shown as sent. */
  const msg = (m?: string, type?: string) => (m ? (type === "server" ? m : t(`form.errors.${m}`)) : undefined);
  const err = (name: keyof PaymentFormValues) => msg(errors[name]?.message, errors[name]?.type);

  const field = (name: keyof PaymentFormValues, label: string, control: React.ReactNode, hint?: string) => {
    const message = err(name);
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={`pf-${name}`} className="text-sm font-medium">
          {label}
        </label>
        {control}
        {hint && !message ? <p id={`pf-${name}-hint`} className="text-sm text-muted">{hint}</p> : null}
        {message ? (
          <p id={`pf-${name}-error`} role="alert" className="text-sm text-danger">
            {message}
          </p>
        ) : null}
      </div>
    );
  };

  const describedBy = (name: keyof PaymentFormValues, hasHint = false) =>
    err(name) ? `pf-${name}-error` : hasHint ? `pf-${name}-hint` : undefined;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-4" aria-labelledby="pf-title">
      <h2 id="pf-title" className="text-lg font-semibold">
        {editing ? t("form.editTitle") : t("form.createTitle")}
      </h2>

      {banner ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
          {banner}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          "member_id",
          t("form.member"),
          <select id="pf-member_id" className={fieldClassInvalid} aria-invalid={Boolean(errors.member_id)} aria-describedby={describedBy("member_id")} {...register("member_id")}>
            <option value="">{t("form.memberPlaceholder")}</option>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>,
        )}
        {field(
          "group",
          t("form.group"),
          <select id="pf-group" className={fieldClassInvalid} aria-invalid={Boolean(errors.group)} aria-describedby={describedBy("group")} {...register("group")}>
            <option value="fixed">{t("groups.fixed")}</option>
            <option value="meals">{t("groups.meals")}</option>
          </select>,
        )}
        {field(
          "amount",
          t("form.amount"),
          <input id="pf-amount" type="text" inputMode="decimal" autoComplete="off" className={fieldClassInvalid} aria-invalid={Boolean(errors.amount)} aria-describedby={describedBy("amount", true)} {...register("amount")} />,
          t("form.amountHint"),
        )}
        {field(
          "paid_on",
          t("form.date"),
          <input id="pf-paid_on" type="date" className={fieldClassInvalid} aria-invalid={Boolean(errors.paid_on)} aria-describedby={describedBy("paid_on")} {...register("paid_on")} />,
        )}
      </div>
      {field(
        "note",
        t("form.note"),
        <textarea id="pf-note" rows={2} maxLength={600} className={fieldClassInvalid} aria-invalid={Boolean(errors.note)} aria-describedby={describedBy("note")} {...register("note")} />,
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onPress={onCancel} className="w-full sm:w-auto">
          {t("actions.cancel")}
        </Button>
        <Button type="submit" variant="primary" className="w-full sm:w-auto" isDisabled={isSubmitting}>
          {isSubmitting ? t("actions.saving") : editing ? t("actions.save") : t("actions.create")}
        </Button>
      </div>
    </form>
  );
}
