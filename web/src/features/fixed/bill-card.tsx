"use client";

import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { useState } from "react";
import type { Bill, Member } from "@/lib/api/contract";
import { useAcceptBill, useSaveBill, useSpreadBill } from "./api";
import { explainError } from "./errors";
import { paisaToTakaInput, parseTakaToPaisa } from "@/lib/format/money-input";
import { fieldClassInvalid as fieldClassInvalid } from "@/components/ui/field";

/** One category's bill for the month: amount, who pays what (shares from the API), hand-set overrides, unallocated. */
export function BillCard({
  messId,
  monthId,
  bill,
  name,
  members,
  canEdit,
  money,
}: {
  messId: number;
  monthId: number;
  bill: Bill;
  name: string;
  members: Member[];
  canEdit: boolean;
  money: (paisa: number) => string;
}) {
  const t = useTranslations("fixed");
  const locale = useLocale() as AppLocale;
  const save = useSaveBill(messId, monthId);
  const spread = useSpreadBill(messId, monthId);
  const accept = useAcceptBill(messId, monthId);

  const isFixedGroup = bill.group === "fixed";
  const initialAmount = bill.amount_paisa > 0 ? paisaToTakaInput(bill.amount_paisa) : "";
  const initialOverrides = Object.fromEntries(bill.overrides.map((o) => [o.member_id, paisaToTakaInput(o.amount_paisa)]));

  const [amount, setAmount] = useState(initialAmount);
  const [overrides, setOverrides] = useState<Record<number, string>>(initialOverrides);
  const [notice, setNotice] = useState<string | null>(null);
  const [badCells, setBadCells] = useState<Set<string>>(new Set());

  const dirty =
    amount !== initialAmount ||
    members.some((m) => (overrides[m.id] ?? "") !== (initialOverrides[m.id] ?? ""));
  const busy = save.isPending || spread.isPending || accept.isPending;
  const unallocated = bill.unallocated_paisa;
  const overrideLabel = bill.split_type === "fixed_per_person" ? t("bill.amountEach") : t("bill.override");
  const idBase = `bill-${bill.category_id}`;

  async function onSave() {
    setNotice(null);
    const bad = new Set<string>();
    const input: { amount_paisa?: number; overrides: { member_id: number; amount_paisa: number }[] } = { overrides: [] };

    if (isFixedGroup && amount.trim() !== "") {
      const parsed = parseTakaToPaisa(amount, { allowZero: true });
      if (parsed.ok) input.amount_paisa = parsed.paisa;
      else bad.add("amount");
    }
    for (const m of members) {
      const text = overrides[m.id] ?? "";
      if (text.trim() === "") continue;
      const parsed = parseTakaToPaisa(text, { allowZero: true });
      if (parsed.ok) input.overrides.push({ member_id: m.id, amount_paisa: parsed.paisa });
      else bad.add(`m${m.id}`);
    }
    setBadCells(bad);
    if (bad.size > 0) return setNotice(t("errors.badAmount"));

    try {
      await save.mutateAsync({ categoryId: bill.category_id, input });
    } catch (error) {
      setNotice(explainError(error, t));
    }
  }

  async function run(action: "spread" | "accept") {
    setNotice(null);
    try {
      await (action === "spread" ? spread : accept).mutateAsync(bill.category_id);
    } catch (error) {
      setNotice(explainError(error, t));
    }
  }

  return (
    <li className="rounded-2xl border border-default-200 bg-surface p-4" aria-label={name}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="min-w-0 break-words text-lg font-semibold">{name}</h3>
          <p className="text-xs text-muted">
            {t(`groups.${bill.group}`)} · {t(`split.${bill.split_type}`)}
          </p>
        </div>
        {!isFixedGroup || !canEdit ? (
          <p className="text-lg font-semibold tabular-nums" data-testid={`amount-${bill.category_id}`}>{money(bill.amount_paisa)}</p>
        ) : null}
      </div>

      {isFixedGroup && canEdit ? (
        <div className="mt-3 flex flex-col gap-1">
          <label htmlFor={`${idBase}-amount`} className="text-sm font-medium">{t("bill.amount")}</label>
          <input
            id={`${idBase}-amount`}
            className={`${fieldClassInvalid} max-w-60`}
            inputMode="decimal"
            autoComplete="off"
            placeholder={formatNumber(0, locale)}
            value={amount}
            aria-invalid={badCells.has("amount") || undefined}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
      ) : null}
      {!isFixedGroup ? <p className="mt-2 text-xs text-muted">{t("bill.fromExpenses")}</p> : null}

      <ul className="mt-3 flex flex-col divide-y divide-default-200" aria-label={t("bill.shares")}>
        {members.map((m) => {
          const share = bill.shares[String(m.id)] ?? 0;
          const hasOverride = bill.overrides.some((o) => o.member_id === m.id);
          return (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 break-words font-medium">{m.display_name}</span>
              <span className="flex items-center gap-3">
                {canEdit ? (
                  <span className="flex items-center gap-2">
                    <label htmlFor={`${idBase}-m${m.id}`} className="sr-only">{`${overrideLabel}: ${m.display_name}`}</label>
                    <input
                      id={`${idBase}-m${m.id}`}
                      className={`${fieldClassInvalid} w-28 text-end`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={t("bill.auto")}
                      value={overrides[m.id] ?? ""}
                      aria-invalid={badCells.has(`m${m.id}`) || undefined}
                      onChange={(e) => setOverrides((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    />
                  </span>
                ) : hasOverride ? (
                  <span className="text-xs text-muted">{t("bill.setByHand")}</span>
                ) : null}
                <span className="min-w-24 text-end font-semibold tabular-nums" data-testid={`share-${bill.category_id}-${m.id}`}>{money(share)}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {unallocated !== 0 ? (
        <div className="mt-3 rounded-lg border border-warning bg-warning/10 p-3" role="status" data-testid={`unallocated-${bill.category_id}`}>
          <p className="font-medium">
            {unallocated > 0 ? t("unallocated.positive", { amount: money(unallocated) }) : t("unallocated.negative", { amount: money(-unallocated) })}
            {bill.unallocated_accepted ? ` · ${t("unallocated.accepted")}` : ""}
          </p>
          {canEdit ? (
            <>
              {dirty ? <p className="mt-1 text-xs text-muted">{t("unallocated.saveFirst")}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {unallocated > 0 ? (
                  <Button size="sm" variant="secondary" isDisabled={dirty || busy} onPress={() => run("spread")} aria-label={`${t("actions.spread")}: ${name}`}>
                    {t("actions.spread")}
                  </Button>
                ) : null}
                {!bill.unallocated_accepted ? (
                  <Button size="sm" variant="secondary" isDisabled={dirty || busy} onPress={() => run("accept")} aria-label={`${t("actions.accept")}: ${name}`}>
                    {t("actions.accept")}
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {notice ? <p role="alert" className="mt-3 rounded-lg border border-danger bg-danger/10 p-2 text-sm text-danger">{notice}</p> : null}

      {canEdit ? (
        <div className="mt-3">
          <Button variant="primary" className="w-full sm:w-auto" isDisabled={!dirty || busy} onPress={onSave} aria-label={`${t("actions.saveBill")}: ${name}`}>
            {save.isPending ? t("actions.saving") : t("actions.saveBill")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
