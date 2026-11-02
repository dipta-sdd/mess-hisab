"use client";

import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { Member, SettlementResult } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useMessRoles } from "@/features/mess/api";
import { useMess } from "@/lib/mess/mess-context";
import { rowFor, useFinalSettlement, useSettlementDashboard } from "./api";
import { paisaToTakaInput, parseTakaToPaisa } from "@/lib/format/money-input";
import { todayInDhaka } from "@/lib/format/date";
import { fieldClassInvalid } from "@/components/ui/field";


function numberFrom(body: unknown, key: string): number | null {
  if (body && typeof body === "object") {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * "Final settlement" button for a members row. Renders nothing until the dashboard says the member
 * has credit. Opens an inline dialog (role="dialog") to pay the credit out of the cash pool.
 */
/** Only the manager can pay out (API route is `mess.role:manager`); an admin who is not the manager sees nothing. */
export function FinalSettlementAction({ member }: { member: Member }) {
  const { messId } = useMess();
  const roles = useMessRoles(messId);
  if (!roles.isManager || roles.isArchived) return null;
  return <FinalSettlementControl member={member} />;
}

function FinalSettlementControl({ member }: { member: Member }) {
  const t = useTranslations("settlement");
  const locale = useLocale() as AppLocale;
  const { messId } = useMess();
  const dashboard = useSettlementDashboard(messId);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SettlementResult | null>(null);

  const row = rowFor(dashboard.data, member.id);
  const credit = Math.max(0, row?.balance_paisa ?? 0);
  const money = (paisa: number) => formatMoney(paisa, locale);

  if (result) {
    return (
      <div role="status" className="flex w-full flex-col gap-1 rounded-xl border border-border p-3 text-sm">
        <p className="font-medium">{t("result.title", { name: member.display_name, amount: money(result.amount_paisa) })}</p>
        <p>{t("result.creditAfter", { amount: money(result.credit_after_paisa) })}</p>
        <p>{t("result.cashAfter", { amount: money(result.cash_pool_paisa) })}</p>
        <p className="text-muted">{t("result.archiveHint")}</p>
      </div>
    );
  }
  if (credit <= 0 || !dashboard.data) return null;

  if (!open) {
    return (
      <Button variant="outline" size="sm" aria-label={t("open.aria", { name: member.display_name })} onPress={() => setOpen(true)}>
        {t("open.button")}
      </Button>
    );
  }

  return (
    <SettlementForm
      member={member}
      credit={credit}
      cash={Math.max(0, dashboard.data.cash_pool_paisa)}
      onCancel={() => setOpen(false)}
      onDone={(r) => setResult(r)}
    />
  );
}

function SettlementForm({
  member,
  credit,
  cash,
  onCancel,
  onDone,
}: {
  member: Member;
  credit: number;
  cash: number;
  onCancel: () => void;
  onDone: (result: SettlementResult) => void;
}) {
  const t = useTranslations("settlement");
  const locale = useLocale() as AppLocale;
  const { messId } = useMess();
  const settle = useFinalSettlement(messId, member.id);
  const money = (paisa: number) => formatMoney(paisa, locale);

  const [amount, setAmount] = useState(paisaToTakaInput(Math.min(credit, cash)));
  const [paidOn, setPaidOn] = useState(todayInDhaka());
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [limits, setLimits] = useState({ credit, cash });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBanner(null);
    const parsed = parseTakaToPaisa(amount);
    if (!parsed.ok) {
      setFieldError(t(`errors.${parsed.reason}`));
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      setFieldError(t("errors.date"));
      return;
    }
    setFieldError(null);
    try {
      onDone(await settle.mutateAsync({ amount_paisa: parsed.paisa, paid_on: paidOn }));
    } catch (error) {
      if (isApiError(error) && error.isConflict && error.code === "exceeds_credit") {
        const limit = numberFrom(error.body, "credit_paisa");
        if (limit !== null) setLimits((l) => ({ ...l, credit: limit }));
        setBanner(limit !== null ? t("errors.exceedsCredit", { amount: money(limit) }) : t("errors.exceedsCreditPlain"));
      } else if (isApiError(error) && error.isConflict && error.code === "exceeds_cash") {
        const limit = numberFrom(error.body, "cash_paisa");
        if (limit !== null) setLimits((l) => ({ ...l, cash: limit }));
        setBanner(limit !== null ? t("errors.exceedsCash", { amount: money(limit) }) : t("errors.exceedsCashPlain"));
      } else if (isApiError(error) && error.isValidation) {
        setBanner(Object.values(error.fieldErrors)[0]?.[0] ?? error.message);
      } else if (isApiError(error) && error.isForbidden) {
        setBanner(t("errors.forbidden"));
      } else {
        setBanner(t("errors.generic"));
      }
    }
  }

  return (
    <form
      role="dialog"
      aria-modal="false"
      aria-label={t("dialog.title", { name: member.display_name })}
      onSubmit={submit}
      noValidate
      className="flex w-full flex-col gap-3 rounded-xl border border-border p-3"
    >
      <h3 className="font-semibold">{t("dialog.title", { name: member.display_name })}</h3>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <dt className="text-muted">{t("dialog.balance")}</dt>
        <dd data-testid="settlement-credit" className="text-right font-medium">{money(limits.credit)}</dd>
        <dt className="text-muted">{t("dialog.cash")}</dt>
        <dd data-testid="settlement-cash" className="text-right font-medium">{money(limits.cash)}</dd>
      </dl>
      {banner ? <p role="alert" className="rounded-lg bg-danger/10 p-2 text-sm text-danger">{banner}</p> : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("dialog.amount")}
        <input className={fieldClassInvalid} inputMode="decimal" value={amount} aria-invalid={!!fieldError} onChange={(e) => setAmount(e.target.value)} />
      </label>
      {fieldError ? <p role="alert" className="text-sm text-danger">{fieldError}</p> : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        {t("dialog.paidOn")}
        <input className={fieldClassInvalid} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" className="w-full sm:w-auto" isPending={settle.isPending}>
          {t("dialog.submit")}
        </Button>
        <Button type="button" variant="ghost" className="w-full sm:w-auto" onPress={onCancel}>
          {t("dialog.cancel")}
        </Button>
      </div>
    </form>
  );
}
