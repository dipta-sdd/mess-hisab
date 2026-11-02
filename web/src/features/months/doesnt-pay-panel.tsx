"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { DoesntPayMode, Month } from "@/lib/api/contract";
import { useCreateDoesntPay, useDashboard, useRecoverables, useUndoDoesntPay } from "./api";
import { parseTakaToPaisa } from "@/lib/format/money-input";
import { Banner, useErrorText } from "./ui";
import { fieldClassInvalid } from "@/components/ui/field";

const MODES: DoesntPayMode[] = ["equal", "by_meals", "manual"];

/** "X doesn't pay" for an open month: manager form + the pending requests (with Undo). */
export function DoesntPayPanel({
  messId,
  month,
  isManager,
  money,
  nameOf,
}: {
  messId: number;
  month: Month;
  isManager: boolean;
  money: (paisa: number) => string;
  nameOf: (memberId: number) => string;
}) {
  const t = useTranslations("months.doesntPay");
  const errorText = useErrorText();
  const dashboard = useDashboard(messId, month.id);
  const pending = useRecoverables(messId, month.id, "pending");
  const create = useCreateDoesntPay(messId, month.id);
  const undo = useUndoDoesntPay(messId, month.id);

  const [debtorId, setDebtorId] = useState<number | null>(null);
  const [mode, setMode] = useState<DoesntPayMode>("equal");
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const rows = dashboard.data?.members ?? [];
  const active = rows.filter((r) => r.is_active && !r.is_archived);
  const debtor = active.find((r) => r.member_id === debtorId);
  // The dashboard shows a due as a negative balance; that is the amount to pass on.
  const debt = debtor && debtor.balance_paisa < 0 ? -debtor.balance_paisa : 0;
  const others = active.filter((r) => r.member_id !== debtorId);

  // Typed amounts: integer paisa only (string parser); blank counts as 0.
  const parsed = others.map((r) => {
    const raw = typed[r.member_id] ?? "";
    const result = raw.trim() === "" ? ({ ok: true, paisa: 0 } as const) : parseTakaToPaisa(raw, { allowZero: true });
    return { id: r.member_id, raw, result };
  });
  const invalidIds = new Set(parsed.filter((p) => !p.result.ok).map((p) => p.id));
  const typedTotal = parsed.reduce((sum, p) => sum + (p.result.ok ? p.result.paisa : 0), 0);
  const remaining = debt - typedTotal;
  const manualReady = invalidIds.size === 0 && remaining === 0 && debt > 0;

  const canSubmit = debtor !== undefined && (mode === "manual" ? manualReady : true) && !create.isPending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!debtor) return;
    setError(null);
    const input =
      mode === "manual"
        ? {
            member_id: debtor.member_id,
            mode,
            manual: parsed.flatMap((p) => (p.result.ok && p.result.paisa > 0 ? [{ member_id: p.id, amount_paisa: p.result.paisa }] : [])),
          }
        : { member_id: debtor.member_id, mode };
    try {
      await create.mutateAsync(input);
      setDebtorId(null);
      setMode("equal");
      setTyped({});
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function doUndo(id: number) {
    setError(null);
    try {
      await undo.mutateAsync(id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const list = pending.data ?? [];

  return (
    <section aria-labelledby="dp-title" className="flex flex-col gap-3 rounded-2xl border border-default-200 bg-surface p-4">
      <h3 id="dp-title" className="text-lg font-semibold">{t("title")}</h3>
      <p className="text-sm text-muted">{t("intro")}</p>

      {error ? <Banner>{error}</Banner> : null}

      {pending.isPending ? (
        <p role="status" className="text-sm text-muted">{t("loading")}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t("none")}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t("pendingTitle")}>
          {list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-default-200 p-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{t("pendingItem", { name: nameOf(r.debtor_member_id) })}</p>
                <p className="text-sm text-muted">{t(`modes.${r.mode}.label`)}</p>
                {r.mode === "manual" ? (
                  <ul className="mt-1 text-sm">
                    {r.shares.map((s) => (
                      <li key={s.member_id} className="break-words tabular-nums">{nameOf(s.member_id)}: {money(s.manual_amount_paisa ?? 0)}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {isManager ? (
                <Button size="sm" variant="danger-soft" onPress={() => doUndo(r.id)} isDisabled={undo.isPending} aria-label={t("undoFor", { name: nameOf(r.debtor_member_id) })}>
                  {t("undo")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {isManager ? (
        <form onSubmit={submit} noValidate aria-label={t("formTitle")} className="flex flex-col gap-3 border-t border-default-200 pt-3">
          <h4 className="font-medium">{t("formTitle")}</h4>

          <div className="flex flex-col gap-1">
            <label htmlFor="dp-member" className="text-sm font-medium">{t("member")}</label>
            <select
              id="dp-member"
              className={fieldClassInvalid}
              value={debtorId ?? ""}
              onChange={(e) => { setDebtorId(e.target.value === "" ? null : Number(e.target.value)); setTyped({}); }}
              disabled={dashboard.isPending}
            >
              <option value="">{t("memberPlaceholder")}</option>
              {active.map((r) => (
                <option key={r.member_id} value={r.member_id}>{r.display_name}</option>
              ))}
            </select>
            {debtor ? (
              <p className="text-sm" data-testid="dp-debt">
                {debt > 0 ? t("debt", { amount: money(debt) }) : t("noDebt")}
              </p>
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{t("modeLegend")}</legend>
            {MODES.map((m) => (
              <label key={m} className="flex min-h-11 items-start gap-2">
                <input type="radio" name="dp-mode" className="mt-1 size-5" checked={mode === m} onChange={() => setMode(m)} />
                <span>
                  <span className="block font-medium">{t(`modes.${m}.label`)}</span>
                  <span className="block text-sm text-muted">{t(`modes.${m}.help`)}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === "manual" && debtor ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t("typedTitle")}</p>
              {others.map((r) => (
                <div key={r.member_id} className="flex flex-col gap-1">
                  <label htmlFor={`dp-amt-${r.member_id}`} className="text-sm">{t("typedFor", { name: r.display_name })}</label>
                  <input
                    id={`dp-amt-${r.member_id}`}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    className={fieldClassInvalid}
                    value={typed[r.member_id] ?? ""}
                    aria-invalid={invalidIds.has(r.member_id)}
                    onChange={(e) => setTyped((prev) => ({ ...prev, [r.member_id]: e.target.value }))}
                  />
                  {invalidIds.has(r.member_id) ? <p role="alert" className="text-sm text-danger">{t("typedInvalid")}</p> : null}
                </div>
              ))}
              <p className="rounded-lg bg-default-100 p-3 text-sm" role="status" data-testid="dp-remaining">
                {remaining === 0
                  ? t("remainingDone")
                  : remaining > 0
                    ? t("remaining", { amount: money(remaining) })
                    : t("over", { amount: money(-remaining) })}
              </p>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" className="w-full sm:w-auto" isDisabled={!canSubmit}>
              {create.isPending ? t("saving") : t("submit")}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
