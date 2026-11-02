"use client";

import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { Group, Member } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { useAdjustments, useCreateAdjustment } from "./api";
import { parseTakaToPaisa } from "@/lib/format/money-input";
import { Banner, useErrorText } from "./ui";
import { fieldClass } from "@/components/ui/field";

type Direction = "charge" | "credit";

/** Adjustments: everyone sees the list; the manager adds one (charge = member owes more, credit = owes less). */
export function AdjustmentsPanel({
  messId,
  isManager,
  members,
  money,
}: {
  messId: number;
  isManager: boolean;
  members: Member[];
  money: (paisa: number) => string;
}) {
  const t = useTranslations("months.adjustments");
  const locale = useLocale() as AppLocale;
  const adjustments = useAdjustments(messId);
  const nameOf = (id: number) => members.find((m) => m.id === id)?.display_name ?? t("unknownMember");
  const list = adjustments.data ?? [];

  return (
    <section aria-labelledby="adj-title" className="flex flex-col gap-3 rounded-2xl border border-default-200 bg-surface p-4">
      <h2 id="adj-title" className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted">{t("intro")}</p>

      {isManager ? <AdjustmentForm messId={messId} members={members} /> : null}

      {adjustments.isError ? (
        <Banner>{t("loadFailed")}</Banner>
      ) : adjustments.isPending ? (
        <p role="status" className="text-sm text-muted">{t("loading")}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t("listLabel")}>
          {list.map((a) => (
            <li key={a.id} className="rounded-xl border border-default-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{nameOf(a.member_id)}</p>
                  <p className="text-sm text-muted">{t(`groups.${a.group}`)} · {formatDate(a.created_at, locale)}</p>
                </div>
                <p className={`shrink-0 font-semibold ${a.amount_paisa < 0 ? "text-danger" : "text-success"}`}>
                  {a.amount_paisa < 0
                    ? t("chargeAmount", { amount: money(-a.amount_paisa) })
                    : t("creditAmount", { amount: money(a.amount_paisa) })}
                </p>
              </div>
              <p className="mt-1 text-sm break-words">{a.note}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AdjustmentForm({ messId, members }: { messId: number; members: Member[] }) {
  const t = useTranslations("months.adjustments");
  const errorText = useErrorText();
  const create = useCreateAdjustment(messId);
  const [memberId, setMemberId] = useState("");
  const [group, setGroup] = useState<Group>("fixed");
  const [direction, setDirection] = useState<Direction>("charge");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const choices = members.filter((m) => !m.archived_at);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    setSaved(false);
    const next: Record<string, string> = {};
    if (memberId === "") next.member = t("form.memberRequired");
    const parsed = parseTakaToPaisa(amount);
    if (!parsed.ok) next.amount = parsed.reason === "empty" ? t("form.amountRequired") : parsed.reason === "zero" ? t("form.amountZero") : t("form.amountInvalid");
    if (note.trim() === "") next.note = t("form.noteRequired");
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.ok) return;

    try {
      await create.mutateAsync({
        member_id: Number(memberId),
        group,
        // charge = the member owes more (negative), credit = the member owes less (positive).
        amount_paisa: direction === "charge" ? -parsed.paisa : parsed.paisa,
        note: note.trim(),
      });
      setAmount("");
      setNote("");
      setSaved(true);
    } catch (error) {
      if (isApiError(error) && error.isValidation) {
        const server: Record<string, string> = {};
        if (error.fieldError("member_id")) server.member = error.fieldError("member_id")!;
        if (error.fieldError("amount_paisa")) server.amount = error.fieldError("amount_paisa")!;
        if (error.fieldError("note")) server.note = error.fieldError("note")!;
        if (Object.keys(server).length > 0) setErrors(server);
        else setBanner(errorText(error));
      } else setBanner(errorText(error));
    }
  }

  const fieldError = (key: string) => (errors[key] ? <p role="alert" className="text-sm text-danger">{errors[key]}</p> : null);

  return (
    <form onSubmit={submit} noValidate aria-label={t("form.title")} className="flex flex-col gap-3 rounded-xl bg-default-100 p-3">
      <h3 className="font-medium">{t("form.title")}</h3>
      {banner ? <Banner>{banner}</Banner> : null}
      {saved ? <p role="status" className="text-sm">{t("form.saved")}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="adj-member" className="text-sm font-medium">{t("form.member")}</label>
          <select id="adj-member" className={fieldClass} value={memberId} aria-invalid={Boolean(errors.member)} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">{t("form.memberPlaceholder")}</option>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
          {fieldError("member")}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="adj-group" className="text-sm font-medium">{t("form.group")}</label>
          <select id="adj-group" className={fieldClass} value={group} onChange={(e) => setGroup(e.target.value as Group)}>
            <option value="fixed">{t("groups.fixed")}</option>
            <option value="meals">{t("groups.meals")}</option>
          </select>
        </div>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">{t("form.direction")}</legend>
        {(["charge", "credit"] as const).map((d) => (
          <label key={d} className="flex min-h-11 items-start gap-2">
            <input type="radio" name="adj-direction" className="mt-1 size-5" checked={direction === d} onChange={() => setDirection(d)} />
            <span>
              <span className="block font-medium">{t(`form.${d}.label`)}</span>
              <span className="block text-sm text-muted">{t(`form.${d}.help`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="adj-amount" className="text-sm font-medium">{t("form.amount")}</label>
        <input id="adj-amount" type="text" inputMode="decimal" autoComplete="off" className={fieldClass} value={amount} aria-invalid={Boolean(errors.amount)} onChange={(e) => setAmount(e.target.value)} />
        {fieldError("amount")}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="adj-note" className="text-sm font-medium">{t("form.note")}</label>
        <textarea id="adj-note" rows={2} maxLength={500} className={fieldClass} value={note} aria-invalid={Boolean(errors.note)} onChange={(e) => setNote(e.target.value)} />
        {fieldError("note")}
      </div>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" isDisabled={create.isPending}>{create.isPending ? t("form.saving") : t("form.save")}</Button>
      </div>
    </form>
  );
}
