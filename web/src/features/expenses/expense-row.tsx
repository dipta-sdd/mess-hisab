"use client";

import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import type { Expense } from "@/lib/api/contract";
import { formatDate } from "@/lib/format";

const statusClass: Record<Expense["status"], string> = {
  pending: "font-medium text-warning",
  approved: "text-muted",
  rejected: "font-medium text-danger",
};

/** One ledger line. Sits inside a divided list, so it has no border of its own. */
export function ExpenseRow({
  expense,
  categoryName,
  payerLabel,
  creatorName,
  locale,
  money,
  showDate = false,
  menu,
  children,
}: {
  expense: Expense;
  categoryName: string;
  payerLabel: string;
  /** Shown in the approval queue ("Recorded by X"). */
  creatorName?: string;
  locale: AppLocale;
  money: (paisa: number) => string;
  /** The ledger groups rows under a date heading; the approval queue has no headings, so it shows the date here. */
  showDate?: boolean;
  /** Per-row actions, placed after the amount. */
  menu?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const t = useTranslations("expenses");
  const flags = [
    expense.is_late ? t("badges.late") : null,
    expense.is_self_recorded ? t("badges.selfRecorded") : null,
    expense.short_cash_converted ? t("badges.shortCash") : null,
  ].filter(Boolean);

  return (
    <li className="px-4 py-3" data-testid={`expense-${expense.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-medium">{categoryName}</p>
          <p className="text-sm text-muted">
            {showDate ? `${formatDate(expense.spent_on, locale)} · ` : ""}
            {t("list.paidByLabel", { name: payerLabel })} · <span className={statusClass[expense.status]}>{t(`status.${expense.status}`)}</span>
            {flags.length > 0 ? ` · ${flags.join(" · ")}` : ""}
          </p>
          {expense.note ? <p className="mt-1 break-words text-sm">{expense.note}</p> : null}
          {creatorName ? <p className="mt-1 break-words text-sm text-muted">{t("queue.recordedBy", { name: creatorName })}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-lg font-semibold tabular-nums">{money(expense.amount_paisa)}</p>
          {menu}
        </div>
      </div>
      {children}
    </li>
  );
}
