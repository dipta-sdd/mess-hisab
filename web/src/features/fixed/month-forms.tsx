"use client";

import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { Member, Month } from "@/lib/api/contract";
import { formatDate, formatMeals } from "@/lib/format";
import { useUpdateMemberSettings, useUpdateMonthSetup, type MemberMonthSettingRow } from "./api";

import { explainError } from "./errors";
import { centiToInput, paisaToTakaInput, parseMealsToCenti, parseTakaToPaisa } from "@/lib/format/money-input";
import { fieldClassInvalid } from "@/components/ui/field";

/** Deadlines and the default deposit for the month. */
export function MonthSetupForm({
  messId,
  month,
  canEdit,
  money,
}: {
  messId: number;
  month: Month;
  canEdit: boolean;
  money: (paisa: number) => string;
}) {
  const t = useTranslations("fixed");
  const locale = useLocale() as AppLocale;
  const update = useUpdateMonthSetup(messId, month.id);

  const [fixedDeadline, setFixedDeadline] = useState(month.fixed_deadline ?? "");
  const [depositDeadline, setDepositDeadline] = useState(month.deposit_deadline ?? "");
  const [deposit, setDeposit] = useState(paisaToTakaInput(month.deposit_paisa));
  const [notice, setNotice] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [depositBad, setDepositBad] = useState(false);

  const dirty =
    fixedDeadline !== (month.fixed_deadline ?? "") ||
    depositDeadline !== (month.deposit_deadline ?? "") ||
    deposit !== paisaToTakaInput(month.deposit_paisa);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setOk(false);
    const input: { fixed_deadline?: string | null; deposit_deadline?: string | null; deposit_paisa?: number } = {};
    if (fixedDeadline !== (month.fixed_deadline ?? "")) input.fixed_deadline = fixedDeadline === "" ? null : fixedDeadline;
    if (depositDeadline !== (month.deposit_deadline ?? "")) input.deposit_deadline = depositDeadline === "" ? null : depositDeadline;
    if (deposit !== paisaToTakaInput(month.deposit_paisa)) {
      const parsed = parseTakaToPaisa(deposit, { allowZero: true });
      if (!parsed.ok) {
        setDepositBad(true);
        return setNotice(t("errors.badAmount"));
      }
      input.deposit_paisa = parsed.paisa;
    }
    setDepositBad(false);
    try {
      await update.mutateAsync(input);
      setOk(true);
    } catch (error) {
      setNotice(explainError(error, t));
    }
  }

  if (!canEdit) {
    return (
      <dl className="grid gap-3 sm:grid-cols-3" data-testid="month-setup-readonly">
        <div><dt className="text-sm text-muted">{t("month.fixedDeadline")}</dt><dd className="font-medium">{month.fixed_deadline ? formatDate(month.fixed_deadline, locale) : t("month.none")}</dd></div>
        <div><dt className="text-sm text-muted">{t("month.depositDeadline")}</dt><dd className="font-medium">{month.deposit_deadline ? formatDate(month.deposit_deadline, locale) : t("month.none")}</dd></div>
        <div><dt className="text-sm text-muted">{t("month.deposit")}</dt><dd className="font-medium">{money(month.deposit_paisa)}</dd></div>
      </dl>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" aria-label={t("month.title")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="fx-fixed-deadline" className="text-sm font-medium">{t("month.fixedDeadline")}</label>
          <input id="fx-fixed-deadline" type="date" className={fieldClassInvalid} value={fixedDeadline} onChange={(e) => setFixedDeadline(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fx-deposit-deadline" className="text-sm font-medium">{t("month.depositDeadline")}</label>
          <input id="fx-deposit-deadline" type="date" className={fieldClassInvalid} value={depositDeadline} onChange={(e) => setDepositDeadline(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="fx-deposit" className="text-sm font-medium">{t("month.deposit")}</label>
          <input
            id="fx-deposit"
            className={fieldClassInvalid}
            inputMode="decimal"
            autoComplete="off"
            value={deposit}
            aria-invalid={depositBad || undefined}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </div>
      </div>
      <p className="text-sm text-muted">{t("month.hint")}</p>
      {notice ? <p role="alert" className="rounded-lg border border-danger bg-danger/10 p-2 text-sm text-danger">{notice}</p> : null}
      {ok && !dirty ? <p role="status" className="text-sm text-success">{t("saved")}</p> : null}
      <div>
        <Button type="submit" variant="primary" className="w-full sm:w-auto" isDisabled={!dirty || update.isPending}>
          {update.isPending ? t("actions.saving") : t("actions.saveMonth")}
        </Button>
      </div>
    </form>
  );
}

/** Per-member deposit and minimum-meals overrides for the month. */
export function MemberSettingRow({
  messId,
  month,
  member,
  setting,
  canEdit,
  money,
}: {
  messId: number;
  month: Month;
  member: Member;
  setting: MemberMonthSettingRow | undefined;
  canEdit: boolean;
  money: (paisa: number) => string;
}) {
  const t = useTranslations("fixed");
  const locale = useLocale() as AppLocale;
  const update = useUpdateMemberSettings(messId, month.id);

  const initialDeposit = setting?.deposit_paisa == null ? "" : paisaToTakaInput(setting.deposit_paisa);
  const initialMin = setting?.min_meals_centi == null ? "" : centiToInput(setting.min_meals_centi);
  const [deposit, setDeposit] = useState(initialDeposit);
  const [minMeals, setMinMeals] = useState(initialMin);
  const [notice, setNotice] = useState<string | null>(null);
  const [bad, setBad] = useState<{ deposit: boolean; min: boolean }>({ deposit: false, min: false });

  const dirty = deposit !== initialDeposit || minMeals !== initialMin;

  async function onSave() {
    setNotice(null);
    const d = deposit.trim() === "" ? null : parseTakaToPaisa(deposit, { allowZero: true });
    const m = minMeals.trim() === "" ? null : parseMealsToCenti(minMeals);
    const badDeposit = d !== null && !d.ok;
    const badMin = m !== null && !m.ok;
    setBad({ deposit: badDeposit, min: badMin });
    if (badDeposit || badMin) return setNotice(t("errors.badValue"));
    try {
      await update.mutateAsync({
        memberId: member.id,
        input: { deposit_paisa: d && d.ok ? d.paisa : null, min_meals_centi: m && m.ok ? m.centi : null },
      });
    } catch (error) {
      setNotice(explainError(error, t));
    }
  }

  if (!canEdit) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="break-words font-medium">{member.display_name}</span>
        <span className="text-sm text-muted">
          {t("members.deposit")}: {money(setting?.deposit_paisa ?? month.deposit_paisa)} · {t("members.minMeals")}:{" "}
          {setting?.min_meals_centi == null ? t("members.defaultValue") : formatMeals(setting.min_meals_centi, locale)}
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <span className="break-words font-medium">{member.display_name}</span>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={`ms-d-${member.id}`} className="text-sm">{`${t("members.deposit")}: ${member.display_name}`}</label>
          <input
            id={`ms-d-${member.id}`}
            className={fieldClassInvalid}
            inputMode="decimal"
            autoComplete="off"
            placeholder={t("members.depositDefault", { amount: money(month.deposit_paisa) })}
            value={deposit}
            aria-invalid={bad.deposit || undefined}
            onChange={(e) => setDeposit(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`ms-m-${member.id}`} className="text-sm">{`${t("members.minMeals")}: ${member.display_name}`}</label>
          <input
            id={`ms-m-${member.id}`}
            className={fieldClassInvalid}
            inputMode="decimal"
            autoComplete="off"
            placeholder={t("members.minMealsDefault")}
            value={minMeals}
            aria-invalid={bad.min || undefined}
            onChange={(e) => setMinMeals(e.target.value)}
          />
        </div>
        <Button variant="secondary" isDisabled={!dirty || update.isPending} onPress={onSave} aria-label={`${t("actions.saveMember")}: ${member.display_name}`}>
          {t("actions.saveMember")}
        </Button>
      </div>
      {notice ? <p role="alert" className="text-sm text-danger">{notice}</p> : null}
    </li>
  );
}
