"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useHistory, useMessInfo } from "@/features/dashboard/api";
import type { AppLocale } from "@/i18n/config";
import { formatMeals, formatMonthLabel, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";

export function HistoryPage() {
  const { messId } = useMess();
  const t = useTranslations("statements");
  const locale = useLocale() as AppLocale;
  const messQ = useMessInfo(messId);
  const historyQ = useHistory(messId);
  const mode = messQ.data?.mess.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, mode);
  const rows = historyQ.data ?? [];
  const href = (monthId: number) => `/${messId}?month=${monthId}`;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("history.title")}</h1>
        <Link href={`/${messId}`} className="text-sm font-medium text-accent underline">{t("links.dashboard")}</Link>
      </div>

      {historyQ.isError ? (
        <p role="alert" className="text-danger">{t("history.loadFailed")}</p>
      ) : historyQ.isPending ? (
        <p role="status" className="text-muted">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p className="text-muted">{t("history.empty")}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.month_id} className="rounded-xl border border-default-200 bg-surface p-3" data-testid={`history-card-${r.month_id}`}>
                <Link href={href(r.month_id)} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{formatMonthLabel(r.starts_on, locale)}</span>
                    <span className="text-xs text-muted">{r.status === "open" ? t("history.open") : t("history.closed")}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted">{t("history.fixedCharged")}</dt><dd className="text-end">{money(r.fixed_charged_paisa)}</dd>
                    <dt className="text-muted">{t("history.mealsCharged")}</dt><dd className="text-end">{money(r.meals_charged_paisa)}</dd>
                    <dt className="text-muted">{t("history.expenses")}</dt><dd className="text-end">{money(r.expenses_paisa)}</dd>
                    <dt className="text-muted">{t("history.paid")}</dt><dd className="text-end">{money(r.paid_paisa)}</dd>
                    <dt className="text-muted">{t("history.mealRate")}</dt><dd className="text-end">{money(r.meal_rate_paisa)}</dd>
                    <dt className="text-muted">{t("history.totalDue")}</dt><dd className="text-end text-danger">{money(r.total_due_paisa)}</dd>
                    <dt className="text-muted">{t("history.totalCredit")}</dt><dd className="text-end text-success">{money(r.total_credit_paisa)}</dd>
                  </dl>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-default-200 text-muted">
                  <th scope="col" className="p-2 text-start">{t("history.month")}</th>
                  <th scope="col" className="p-2 text-start">{t("history.status")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.fixedCharged")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.mealsCharged")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.expenses")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.paid")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.totalMeals")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.mealRate")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.totalDue")}</th>
                  <th scope="col" className="p-2 text-end">{t("history.totalCredit")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month_id} className="border-b border-default-100" data-testid={`history-row-${r.month_id}`}>
                    <th scope="row" className="p-2 text-start font-medium">
                      <Link href={href(r.month_id)} className="text-accent underline">{formatMonthLabel(r.starts_on, locale)}</Link>
                    </th>
                    <td className="p-2">{r.status === "open" ? t("history.open") : t("history.closed")}</td>
                    <td className="p-2 text-end">{money(r.fixed_charged_paisa)}</td>
                    <td className="p-2 text-end">{money(r.meals_charged_paisa)}</td>
                    <td className="p-2 text-end">{money(r.expenses_paisa)}</td>
                    <td className="p-2 text-end">{money(r.paid_paisa)}</td>
                    <td className="p-2 text-end">{formatMeals(r.total_meals_centi, locale)}</td>
                    <td className="p-2 text-end">{money(r.meal_rate_paisa)}</td>
                    <td className="p-2 text-end text-danger">{money(r.total_due_paisa)}</td>
                    <td className="p-2 text-end text-success">{money(r.total_credit_paisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
