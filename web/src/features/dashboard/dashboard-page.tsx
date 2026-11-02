"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { DashboardRow } from "@/lib/api/contract";
import { formatDate, formatMeals, formatMoney, formatNumber } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useDashboard, useHistory, useMessInfo } from "./api";
import { Balance, MonthPicker, OverdueBadge, is404 } from "./shared";

const isOverdue = (r: DashboardRow) => r.fixed_overdue_days > 0 || r.deposit_overdue_days > 0;

export function DashboardPage({ initialMonthId = null }: { initialMonthId?: number | null }) {
  const { messId } = useMess();
  const t = useTranslations("dashboard");
  const locale = useLocale() as AppLocale;

  const [picked, setPicked] = useState<number | null>(initialMonthId);
  const [view, setView] = useState<"all" | "overdue">("all");

  const messQ = useMessInfo(messId);
  const historyQ = useHistory(messId);
  const dashQ = useDashboard(messId, picked);

  const mode = messQ.data?.mess.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, mode);
  const data = dashQ.data;

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Link href={`/${messId}/history`} className="text-sm font-medium text-accent underline">{t("links.history")}</Link>
    </div>
  );

  const picker = (
    <div className="max-w-sm">
      <MonthPicker selected={picked ?? data?.month.id ?? null} current={data?.month} history={historyQ.data} onChange={setPicked} />
    </div>
  );

  if (dashQ.isError) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        {header}
        {picked !== null ? picker : null}
        <p role="alert" className="text-danger">{is404(dashQ.error) ? t("errors.notFound") : t("errors.loadFailed")}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        {header}
        {picked !== null ? picker : null}
        <p role="status" className="text-muted">{t("loading")}</p>
      </div>
    );
  }

  const monthId = data.month.id;
  const { totals } = data;
  const members = data.members;
  const overdueCount = members.filter(isOverdue).length;
  const shown = view === "overdue" ? members.filter(isOverdue) : members;
  const managerName = members.find((m) => m.member_id === data.manager_member_id)?.display_name;
  const stmtHref = (id: number) => `/${messId}/statements/${id}?month=${monthId}`;

  const stats: { key: string; label: string; value: React.ReactNode }[] = [
    { key: "fixed-bills", label: t("totals.fixedBills"), value: money(totals.fixed_bills_paisa) },
    { key: "fixed-expenses", label: t("totals.fixedExpenses"), value: money(totals.fixed_expenses_paisa) },
    { key: "meals-expenses", label: t("totals.mealsExpenses"), value: money(totals.meals_expenses_paisa) },
    { key: "food-cost", label: t("totals.foodCost"), value: money(totals.food_cost_paisa) },
    { key: "meal-rate", label: t("totals.mealRate"), value: money(totals.meal_rate_paisa) },
    { key: "total-meals", label: t("totals.totalMeals"), value: formatMeals(totals.total_meals_centi, locale) },
    { key: "charged", label: t("totals.charged"), value: money(totals.charged_paisa) },
    { key: "paid", label: t("totals.paid"), value: money(totals.paid_paisa) },
    { key: "rounding", label: t("totals.roundingExtra"), value: money(totals.rounding_extra_paisa) },
    { key: "cash-pool", label: t("totals.cashPool"), value: money(data.cash_pool_paisa) },
    {
      key: "manager-balance",
      label: managerName ? t("totals.managerBalanceNamed", { name: managerName }) : t("totals.managerBalance"),
      value: <Balance paisa={data.manager_balance_paisa} mode={mode} />,
    },
  ];

  const statusLabel = data.month.status === "open" ? t("month.open") : t("month.closed");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      {header}
      {picker}

      <p className="text-sm text-muted" data-testid="month-status">
        {t("month.status", { status: statusLabel })}
        {data.month.fixed_deadline ? ` · ${t("month.fixedDeadline", { date: formatDate(data.month.fixed_deadline, locale) })}` : ""}
        {data.month.deposit_deadline ? ` · ${t("month.depositDeadline", { date: formatDate(data.month.deposit_deadline, locale) })}` : ""}
      </p>

      {totals.zero_meals_unresolved ? (
        <p role="note" className="rounded-lg border border-warning bg-warning/10 p-3 text-sm">{t("totals.zeroMealsUnresolved")}</p>
      ) : null}
      {totals.uncharged_food_paisa > 0 ? (
        <p role="note" className="rounded-lg border border-warning bg-warning/10 p-3 text-sm">
          {t("totals.unchargedFood", { amount: money(totals.uncharged_food_paisa) })}
        </p>
      ) : null}

      <section aria-labelledby="totals-title">
        <h2 id="totals-title" className="sr-only">{t("totals.title")}</h2>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.key} className="rounded-xl border border-default-200 bg-surface p-3" data-testid={`stat-${s.key}`}>
              <dt className="text-xs text-muted">{s.label}</dt>
              <dd className="break-words text-lg font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="members-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="members-title" className="text-lg font-semibold">{t("members.title")}</h2>
          <div className="flex gap-2" role="group" aria-label={t("members.viewLabel")}>
            <button
              type="button"
              aria-pressed={view === "all"}
              onClick={() => setView("all")}
              className={`min-h-11 rounded-lg border px-3 text-sm ${view === "all" ? "border-accent bg-accent text-accent-foreground" : "border-default-300"}`}
            >
              {t("members.all", { count: formatNumber(members.length, locale) })}
            </button>
            <button
              type="button"
              aria-pressed={view === "overdue"}
              onClick={() => setView("overdue")}
              className={`min-h-11 rounded-lg border px-3 text-sm ${view === "overdue" ? "border-danger bg-danger text-white" : "border-default-300"}`}
            >
              {t("members.overdue", { count: formatNumber(overdueCount, locale) })}
            </button>
          </div>
        </div>

        {members.length === 0 ? (
          <p className="text-muted">{t("members.empty")}</p>
        ) : shown.length === 0 ? (
          <p className="text-muted">{t("members.noneOverdue")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3 md:hidden">
              {shown.map((r) => (
                <li key={r.member_id} className="rounded-xl border border-default-200 bg-surface p-3" data-testid={`member-card-${r.member_id}`}>
                  <Link href={stmtHref(r.member_id)} className="flex flex-col gap-2" aria-label={t("members.openStatement", { name: r.display_name })}>
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 break-words font-semibold">
                        {r.display_name}
                        {r.is_archived ? <span className="ml-2 text-xs text-muted">{t("members.archived")}</span> : null}
                      </span>
                      <Balance paisa={r.balance_paisa} mode={mode} />
                    </div>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm tabular-nums">
                      <dt className="text-muted">{t("members.fixedBill")}</dt>
                      <dd className="text-end">{money(r.fixed_bill_paisa)}</dd>
                      <dt className="text-muted">{t("members.mealsBill")}</dt>
                      <dd className="text-end">{money(r.meals_bill_paisa)}</dd>
                      <dt className="text-muted">{t("members.fixedBalance")}</dt>
                      <dd className="text-end"><Balance paisa={r.fixed_balance_paisa} mode={mode} /></dd>
                      <dt className="text-muted">{t("members.mealsBalance")}</dt>
                      <dd className="text-end"><Balance paisa={r.meals_balance_paisa} mode={mode} /></dd>
                      <dt className="text-muted">{t("members.outstanding")}</dt>
                      <dd className="text-end">{money(r.fixed_outstanding_paisa)}</dd>
                      <dt className="text-muted">{t("members.depositOutstanding")}</dt>
                      <dd className="text-end">{money(r.deposit_outstanding_paisa)}</dd>
                    </dl>
                    {isOverdue(r) ? (
                      <div className="flex flex-wrap gap-2">
                        <OverdueBadge days={r.fixed_overdue_days} kind="fixed" />
                        <OverdueBadge days={r.deposit_overdue_days} kind="deposit" />
                      </div>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-default-200 text-start text-muted">
                    <th scope="col" className="p-2 text-start">{t("members.member")}</th>
                    <th scope="col" className="p-2 text-end">{t("members.fixedBill")}</th>
                    <th scope="col" className="p-2 text-end">{t("members.mealsBill")}</th>
                    <th scope="col" className="p-2 text-end">{t("members.fixedBalance")}</th>
                    <th scope="col" className="p-2 text-end">{t("members.mealsBalance")}</th>
                    <th scope="col" className="p-2 text-end">{t("members.balance")}</th>
                    <th scope="col" className="p-2 text-end">{t("members.outstanding")}</th>
                    <th scope="col" className="p-2 text-end">{t("members.depositOutstanding")}</th>
                    <th scope="col" className="p-2 text-start">{t("members.overdueCol")}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.member_id} className="border-b border-default-100" data-testid={`member-row-${r.member_id}`}>
                      <th scope="row" className="p-2 text-start font-medium">
                        <Link href={stmtHref(r.member_id)} className="text-accent underline">{r.display_name}</Link>
                        {r.is_archived ? <span className="ml-2 text-xs text-muted">{t("members.archived")}</span> : null}
                      </th>
                      <td className="p-2 text-end">{money(r.fixed_bill_paisa)}</td>
                      <td className="p-2 text-end">{money(r.meals_bill_paisa)}</td>
                      <td className="p-2 text-end"><Balance paisa={r.fixed_balance_paisa} mode={mode} /></td>
                      <td className="p-2 text-end"><Balance paisa={r.meals_balance_paisa} mode={mode} /></td>
                      <td className="p-2 text-end"><Balance paisa={r.balance_paisa} mode={mode} /></td>
                      <td className="p-2 text-end">{money(r.fixed_outstanding_paisa)}</td>
                      <td className="p-2 text-end">{money(r.deposit_outstanding_paisa)}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          <OverdueBadge days={r.fixed_overdue_days} kind="fixed" />
                          <OverdueBadge days={r.deposit_overdue_days} kind="deposit" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
