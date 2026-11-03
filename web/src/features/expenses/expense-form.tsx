"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { Category, Expense, Member } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import type { ExpenseInput, ExpensePatch } from "@/lib/api/contract";
import { useCreateExpense, useUpdateExpense, type CreateResult } from "./api";
import { todayInDhaka } from "@/lib/format/date";
import { paisaToTakaInput, parseTakaToPaisa } from "@/lib/format/money-input";
import { errorKey } from "./rules";
import { expenseFormSchema, type ExpenseFormValues } from "./schema";
import { fieldClassInvalid } from "@/components/ui/field";

/** Maps API field names to form field names. */
const SERVER_FIELDS: Record<string, keyof ExpenseFormValues> = {
  category_id: "category_id",
  amount_paisa: "amount",
  spent_on: "spent_on",
  note: "note",
  paid_by: "payer",
  paid_by_member_id: "payer_member_id",
};

/** Identity of who paid, to tell whether an edit changed it. */
const payerKey = (paidBy: "cash" | "member", memberId: number | null) => (paidBy === "cash" ? "cash" : `m:${memberId}`);

export function ExpenseForm({
  messId,
  me,
  members,
  categories,
  expense,
  prefill,
  onSaved,
  onQueued,
  onCancel,
  bare = false,
}: {
  messId: number;
  me: Member;
  members: Member[];
  categories: Category[];
  /** When set, the form edits this expense. */
  expense?: Expense;
  /** Start a new expense from these values (a queued one being fixed). */
  prefill?: ExpenseInput;
  onSaved: (result: CreateResult) => void;
  /** The expense was kept offline and will sync later. */
  onQueued?: () => void;
  onCancel?: () => void;
  /** Drop the card chrome when the form already sits in a drawer. */
  bare?: boolean;
}) {
  const t = useTranslations("expenses");
  const create = useCreateExpense(messId, me.id);
  const update = useUpdateExpense(messId);
  const [banner, setBanner] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // Editing starts from a button far down the list; bring the form into view.
  useEffect(() => {
    if (expense) titleRef.current?.scrollIntoView?.({ block: "start" });
  }, [expense]);
  const editing = Boolean(expense);
  const isManager = me.is_manager || me.is_admin;

  const initialPayer: ExpenseFormValues["payer"] = !expense
    ? "me"
    : expense.paid_by === "cash"
      ? "cash"
      : expense.paid_by_member_id === me.id
        ? "me"
        : "other";

  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      category_id: expense ? String(expense.category_id) : prefill ? String(prefill.category_id) : "",
      amount: expense ? paisaToTakaInput(expense.amount_paisa) : prefill ? paisaToTakaInput(prefill.amount_paisa) : "",
      spent_on: expense?.spent_on ?? prefill?.spent_on ?? todayInDhaka(),
      note: expense?.note ?? prefill?.note ?? "",
      payer: initialPayer,
      payer_member_id: initialPayer === "other" && expense?.paid_by_member_id ? String(expense.paid_by_member_id) : "",
    },
  });
  const payer = useWatch({ control, name: "payer" });

  // Archived categories are hidden, except the one an edited expense already uses.
  const usable = categories
    .filter((c) => !c.archived_at || c.id === expense?.category_id)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const payers = members.filter((m) => !m.archived_at || m.id === expense?.paid_by_member_id);

  async function onSubmit(values: ExpenseFormValues) {
    setBanner(null);
    const parsed = parseTakaToPaisa(values.amount);
    if (!parsed.ok) return;
    const note = values.note.trim() === "" ? null : values.note.trim();
    const categoryId = Number(values.category_id);
    const paidBy = values.payer === "cash" ? ("cash" as const) : ("member" as const);
    const payerId = values.payer === "other" ? Number(values.payer_member_id) : me.id;

    try {
      if (expense) {
        // Send only what changed, so e.g. a note edit doesn't reset the short-cash flag.
        const patch: ExpensePatch = {};
        if (categoryId !== expense.category_id) patch.category_id = categoryId;
        if (parsed.paisa !== expense.amount_paisa) patch.amount_paisa = parsed.paisa;
        if (values.spent_on !== expense.spent_on) patch.spent_on = values.spent_on;
        if (note !== expense.note) patch.note = note;
        if (payerKey(paidBy, payerId) !== payerKey(expense.paid_by, expense.paid_by_member_id)) {
          patch.paid_by = paidBy;
          if (paidBy === "member") patch.paid_by_member_id = payerId;
        }
        if (Object.keys(patch).length === 0) return onCancel?.();
        const saved = await update.mutateAsync({ id: expense.id, patch });
        onSaved({ expense: saved, warnings: saved.short_cash_converted && !expense.short_cash_converted ? ["short_cash_converted"] : [] });
      } else {
        const result = await create.mutateAsync({
          category_id: categoryId,
          amount_paisa: parsed.paisa,
          spent_on: values.spent_on,
          note,
          paid_by: paidBy,
          ...(paidBy === "member" ? { paid_by_member_id: payerId } : {}),
        });
        if ("queued" in result) {
          reset({ ...values, amount: "", note: "" });
          return (onQueued ?? onCancel)?.();
        }
        onSaved(result);
        // Ready for the next receipt: keep category, date and payer.
        reset({ ...values, amount: "", note: "" });
      }
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
      } else {
        const key = errorKey(error);
        setBanner(key === "generic" && error.message ? error.message : t(`errors.${key}`));
      }
    }
  }

  /** Zod messages are i18n keys; server messages are shown as sent. */
  const msg = (m?: string, type?: string) => (m ? (type === "server" ? m : t(`form.errors.${m}`)) : undefined);
  const err = (name: keyof ExpenseFormValues) => msg(errors[name]?.message, errors[name]?.type);
  const describedBy = (name: keyof ExpenseFormValues, hasHint = false) => (err(name) ? `ef-${name}-error` : hasHint ? `ef-${name}-hint` : undefined);

  const field = (name: keyof ExpenseFormValues, label: string, control: React.ReactNode, hint?: string) => {
    const message = err(name);
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={`ef-${name}`} className="text-sm font-medium">
          {label}
        </label>
        {control}
        {hint && !message ? <p id={`ef-${name}-hint`} className="text-sm text-muted">{hint}</p> : null}
        {message ? (
          <p id={`ef-${name}-error`} role="alert" className="text-sm text-danger">
            {message}
          </p>
        ) : null}
      </div>
    );
  };

  const groups = (["fixed", "meals"] as const).map((g) => ({ group: g, items: usable.filter((c) => c.group === g) })).filter((g) => g.items.length > 0);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className={`flex flex-col gap-4 ${bare ? "" : "rounded-2xl border border-border bg-surface p-4"}`} aria-labelledby="ef-title">
      <h2 id="ef-title" ref={titleRef} className="text-lg font-semibold">
        {editing ? t("form.editTitle") : t("form.createTitle")}
      </h2>

      {banner ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
          {banner}
        </div>
      ) : null}

      {field(
        "amount",
        t("form.amount"),
        <input
          id="ef-amount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={`${fieldClassInvalid} text-xl font-semibold`}
          aria-invalid={Boolean(errors.amount)}
          aria-describedby={describedBy("amount", true)}
          {...register("amount")}
        />,
        t("form.amountHint"),
      )}

      {field(
        "category_id",
        t("form.category"),
        <select id="ef-category_id" className={fieldClassInvalid} aria-invalid={Boolean(errors.category_id)} aria-describedby={describedBy("category_id")} {...register("category_id")}>
          <option value="">{t("form.categoryPlaceholder")}</option>
          {groups.map(({ group, items }) => (
            <optgroup key={group} label={t(`groups.${group}`)}>
              {items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>,
      )}

      {isManager ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("form.paidBy")}</legend>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" value="me" className="size-5 accent-[var(--accent)]" {...register("payer")} />
            <span>{t("form.payerMe")}</span>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" value="cash" className="size-5 accent-[var(--accent)]" {...register("payer")} />
            <span>{t("form.payerCash")}</span>
          </label>
          <label className="flex min-h-11 items-center gap-3">
            <input type="radio" value="other" className="size-5 accent-[var(--accent)]" {...register("payer")} />
            <span>{t("form.payerOther")}</span>
          </label>
          {payer === "other"
            ? field(
                "payer_member_id",
                t("form.payerMember"),
                <select id="ef-payer_member_id" className={fieldClassInvalid} aria-invalid={Boolean(errors.payer_member_id)} aria-describedby={describedBy("payer_member_id")} {...register("payer_member_id")}>
                  <option value="">{t("form.payerMemberPlaceholder")}</option>
                  {payers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>,
              )
            : null}
          {payer === "cash" ? <p className="text-sm text-muted">{t("form.cashHint")}</p> : null}
          {errors.payer?.message ? <p role="alert" className="text-sm text-danger">{msg(errors.payer.message, errors.payer.type)}</p> : null}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{t("form.paidBy")}</p>
          <p>{t("form.payerMeOnly")}</p>
          {errors.payer?.message ? <p role="alert" className="text-sm text-danger">{msg(errors.payer.message, errors.payer.type)}</p> : null}
          {errors.payer_member_id?.message ? <p role="alert" className="text-sm text-danger">{msg(errors.payer_member_id.message, errors.payer_member_id.type)}</p> : null}
        </div>
      )}

      {field(
        "spent_on",
        t("form.date"),
        <input id="ef-spent_on" type="date" max={todayInDhaka()} className={fieldClassInvalid} aria-invalid={Boolean(errors.spent_on)} aria-describedby={describedBy("spent_on")} {...register("spent_on")} />,
      )}
      {field(
        "note",
        t("form.note"),
        <textarea id="ef-note" rows={2} maxLength={600} className={fieldClassInvalid} aria-invalid={Boolean(errors.note)} aria-describedby={describedBy("note")} {...register("note")} />,
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" onPress={onCancel} className="w-full sm:w-auto">
            {t("actions.cancel")}
          </Button>
        ) : null}
        <Button type="submit" variant="primary" isDisabled={isSubmitting} className="min-h-12 w-full sm:w-auto">
          {isSubmitting ? t("actions.saving") : editing ? t("actions.save") : t("actions.create")}
        </Button>
      </div>
    </form>
  );
}
