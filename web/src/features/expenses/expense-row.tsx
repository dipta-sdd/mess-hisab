"use client";

import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import type { Expense } from "@/lib/api/contract";
import { formatDate } from "@/lib/format";

const badgeBase = "rounded-full px-2 py-0.5 text-xs font-medium";
const statusClass: Record<Expense["status"], string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-danger/15 text-danger",
};

export function ExpenseRow({
  expense,
  categoryName,
  payerLabel,
  creatorName,
  locale,
  money,
  children,
}: {
  expense: Expense;
  categoryName: string;
  payerLabel: string;
  /** Shown in the approval queue ("Recorded by X"). */
  creatorName?: string;
  locale: AppLocale;
  money: (paisa: number) => string;
  children?: React.ReactNode;
}) {
  const t = useTranslations("expenses");
  return (
    <li className="rounded-xl border border-default-200 bg-surface p-3" data-testid={`expense-${expense.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{categoryName}</p>
          <p className="text-sm text-muted">
            {formatDate(expense.spent_on, locale)} · {t("list.paidByLabel", { name: payerLabel })}
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums">{money(expense.amount_paisa)}</p>
      </div>
      {expense.note ? <p className="mt-1 text-sm break-words">{expense.note}</p> : null}
      {creatorName ? <p className="mt-1 break-words text-xs text-muted">{t("queue.recordedBy", { name: creatorName })}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`${badgeBase} ${statusClass[expense.status]}`}>{t(`status.${expense.status}`)}</span>
        {expense.is_late ? <span className={`${badgeBase} bg-default-200 text-foreground`}>{t("badges.late")}</span> : null}
        {expense.is_self_recorded ? <span className={`${badgeBase} bg-default-200 text-foreground`}>{t("badges.selfRecorded")}</span> : null}
        {expense.short_cash_converted ? <span className={`${badgeBase} bg-warning/15 text-warning`}>{t("badges.shortCash")}</span> : null}
      </div>
      {children}
    </li>
  );
}
