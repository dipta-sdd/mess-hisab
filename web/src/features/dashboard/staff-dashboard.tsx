"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { DashboardRow } from "@/lib/api/contract";
import { formatDate, formatMeals, formatMoney, formatMonthLabel, formatNumber } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useDashboard, useHistory, useMessInfo } from "./api";
import { MemberBalances, SpendingByCategory } from "./charts";
import { Balance, MonthPicker, OverdueBadge, is404 } from "./shared";

const isOverdue = (r: DashboardRow) => r.fixed_overdue_days > 0 || r.deposit_overdue_days > 0;

function Row({ id, label, value }: { id: string; label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5" data-testid={`stat-${id}`}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="break-words text-end font-medium tabular-nums">{value}</dd>
    </div>
  );
}

export function StaffDashboard({ initialMonthId = null }: { initialMonthId?: number | null }) {
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
      <h1 className="text-2xl font-semibold text-balance">{t("adminTitle")}</h1>
      <Link href={`/${messId}/history`} className="text-sm font-medium text-accent underline">{t("links.history")}</Link>
    </div>
  );

  const picker = (
    <div className="max-w-sm">
      <MonthPicker selected={picked ?? data?.month.id ?? null} current={data?.month} history={historyQ.data} onChange={setPicked} />
    </div>
  );

  const shell = "mx-auto flex w-full max-w-5xl flex-col gap-6 p-4";

  if (dashQ.isError) {
    return (
      <div className={shell}>
        {header}
        {picked !== null ? picker : null}
        <p role="alert" className="text-danger">{is404(dashQ.error) ? t("errors.notFound") : t("errors.loadFailed")}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={shell}>
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
  const toCollect = members.reduce((sum, m) => sum + m.fixed_outstanding_paisa + m.deposit_outstanding_paisa, 0);

  // History is newest first, so the older month sits one step further along the list.
  const months = historyQ.data ?? [];
  const at = months.findIndex((h) => h.month_id === monthId);
  const older = at >= 0 ? months[at + 1] : undefined;
  const newer = at > 0 ? months[at - 1] : undefined;

  const statusLabel = data.month.status === "open" ? t("month.open") : t("month.closed");

  const alerts: React.ReactNode[] = [];
  if (overdueCount > 0) {
    alerts.push(
      <li key="overdue" className="flex flex-wrap items-center justify-between gap-2">
        <span>{t("alerts.overdue", { count: formatNumber(overdueCount, locale) })}</span>
        <button type="button" onClick={() => setView("overdue")} className="min-h-11 text-sm font-medium underline">{t("alerts.show")}</button>
      </li>,
    );
  }
  if (totals.zero_meals_unresolved) alerts.push(<li key="zero" role="note">{t("totals.zeroMealsUnresolved")}</li>);
  if (totals.uncharged_food_paisa > 0) {
    alerts.push(<li key="uncharged" role="note">{t("totals.unchargedFood", { amount: money(totals.uncharged_food_paisa) })}</li>);
  }

  return (
    <div className={shell}>
      <div className="flex flex-col gap-3">
        {header}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <div className="flex items-center gap-1" role="group" aria-label={t("month.label")}>
            <Button isIconOnly variant="ghost" aria-label={t("month.prev")} isDisabled={!older} onPress={() => older && setPicked(older.month_id)} className="size-11">
              <span aria-hidden="true">‹</span>
            </Button>
            <span className="min-w-36 text-center text-lg font-semibold">{formatMonthLabel(data.month.starts_on, locale)}</span>
            <Button isIconOnly variant="ghost" aria-label={t("month.next")} isDisabled={!newer} onPress={() => newer && setPicked(newer.month_id)} className="size-11">
              <span aria-hidden="true">›</span>
            </Button>
          </div>
          <p className="text-sm text-muted" data-testid="month-status">
            {t("month.status", { status: statusLabel })}
            {data.month.fixed_deadline ? ` · ${t("month.fixedDeadline", { date: formatDate(data.month.fixed_deadline, locale) })}` : ""}
            {data.month.deposit_deadline ? ` · ${t("month.depositDeadline", { date: formatDate(data.month.deposit_deadline, locale) })}` : ""}
          </p>
        </div>
      </div>

      {alerts.length > 0 ? (
        <ul className="flex flex-col gap-2 rounded-xl bg-warning/10 px-4 py-3 text-sm" aria-label={t("alerts.title")}>
          {alerts}
        </ul>
      ) : null}

      <section aria-labelledby="cash-label" className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4" data-testid="cash-card">
        <div>
          <p id="cash-label" className="text-sm text-muted">{t("totals.cashPool")}</p>
          <p className="text-4xl font-semibold tabular-nums" data-testid="stat-cash-pool">{money(data.cash_pool_paisa)}</p>
          <p className="mt-1 text-sm text-muted">{t("totals.toCollect")}: <span className="font-medium tabular-nums text-foreground">{money(toCollect)}</span></p>
        </div>
        <dl className="flex gap-8">
          <div data-testid="stat-meal-rate">
            <dt className="text-sm text-muted">{t("totals.mealRate")}</dt>
            <dd className="text-xl font-semibold tabular-nums">{money(totals.meal_rate_paisa)}</dd>
          </div>
          <div data-testid="stat-total-meals">
            <dt className="text-sm text-muted">{t("totals.totalMeals")}</dt>
            <dd className="text-xl font-semibold tabular-nums">{formatMeals(totals.total_meals_centi, locale)}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="totals-title" className="grid rounded-2xl border border-border bg-surface md:grid-cols-2 md:divide-x md:divide-border">
        <h2 id="totals-title" className="sr-only">{t("totals.title")}</h2>
        <div className="p-4 md:p-5">
          <h3 className="text-base font-semibold">{t("totals.fixedGroup")}</h3>
          <dl className="mt-1 divide-y divide-border">
            <Row id="fixed-bills" label={t("totals.fixedBills")} value={money(totals.fixed_bills_paisa)} />
            <Row id="fixed-expenses" label={t("totals.fixedExpenses")} value={money(totals.fixed_expenses_paisa)} />
            <Row id="rounding" label={t("totals.roundingExtra")} value={money(totals.rounding_extra_paisa)} />
            <Row
              id="manager-balance"
              label={managerName ? t("totals.managerBalanceNamed", { name: managerName }) : t("totals.managerBalance")}
              value={<Balance paisa={data.manager_balance_paisa ?? 0} mode={mode} />}
            />
          </dl>
        </div>
        <div className="border-t border-border p-4 md:border-t-0 md:p-5">
          <h3 className="text-base font-semibold">{t("totals.mealsGroup")}</h3>
          <dl className="mt-1 divide-y divide-border">
            <Row id="meals-expenses" label={t("totals.mealsExpenses")} value={money(totals.meals_expenses_paisa)} />
            <Row id="food-cost" label={t("totals.foodCost")} value={money(totals.food_cost_paisa)} />
            <Row id="charged" label={t("totals.charged")} value={money(totals.charged_paisa)} />
            <Row id="paid" label={t("totals.paid")} value={money(totals.paid_paisa)} />
          </dl>
        </div>
      </section>

      <section aria-labelledby="members-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="members-title" className="text-lg font-semibold">{t("members.title")}</h2>
          <div className="flex gap-2" role="group" aria-label={t("members.viewLabel")}>
            <button
              type="button"
              aria-pressed={view === "all"}
              onClick={() => setView("all")}
              className={`min-h-11 rounded-lg border px-3 text-sm ${view === "all" ? "border-accent bg-accent text-accent-foreground" : "border-border"}`}
            >
              {t("members.all", { count: formatNumber(members.length, locale) })}
            </button>
            <button
              type="button"
              aria-pressed={view === "overdue"}
              onClick={() => setView("overdue")}
              className={`min-h-11 rounded-lg border px-3 text-sm ${view === "overdue" ? "border-danger bg-danger text-danger-foreground" : "border-border"}`}
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
            <ul className="divide-y divide-border rounded-2xl border border-border bg-surface md:hidden">
              {shown.map((r) => (
                <li key={r.member_id} data-testid={`member-card-${r.member_id}`}>
                  <Link href={stmtHref(r.member_id)} className="flex flex-col gap-1.5 p-4" aria-label={t("members.openStatement", { name: r.display_name })}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words font-medium">
                        {r.display_name}
                        {r.is_archived ? <span className="ms-2 text-sm text-muted">{t("members.archived")}</span> : null}
                      </span>
                      <Balance paisa={r.balance_paisa} mode={mode} />
                    </div>
                    <p className="text-sm text-muted tabular-nums">
                      {t("members.bill")} {money(r.fixed_bill_paisa + r.meals_bill_paisa)} · {t("members.toPay")} {money(r.fixed_outstanding_paisa + r.deposit_outstanding_paisa)}
                    </p>
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

            <div className="hidden overflow-x-auto rounded-2xl border border-border bg-surface md:block">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th scope="col" className="px-4 py-3 text-start font-medium">{t("members.member")}</th>
                    <th scope="col" className="px-4 py-3 text-end font-medium">{t("members.bill")}</th>
                    <th scope="col" className="px-4 py-3 text-end font-medium">{t("members.toPay")}</th>
                    <th scope="col" className="px-4 py-3 text-end font-medium">{t("members.balance")}</th>
                    <th scope="col" className="px-4 py-3 text-start font-medium">{t("members.overdueCol")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((r) => (
                    <tr key={r.member_id} className="hover:bg-default/50" data-testid={`member-row-${r.member_id}`}>
                      <th scope="row" className="px-4 py-3 text-start font-medium">
                        <Link href={stmtHref(r.member_id)} className="hover:underline">{r.display_name}</Link>
                        {r.is_archived ? <span className="ms-2 text-sm font-normal text-muted">{t("members.archived")}</span> : null}
                      </th>
                      <td className="px-4 py-3 text-end">{money(r.fixed_bill_paisa + r.meals_bill_paisa)}</td>
                      <td className="px-4 py-3 text-end">{money(r.fixed_outstanding_paisa + r.deposit_outstanding_paisa)}</td>
                      <td className="px-4 py-3 text-end"><Balance paisa={r.balance_paisa} mode={mode} /></td>
                      <td className="px-4 py-3">
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

      <div className="grid gap-4 md:grid-cols-2">
        <SpendingByCategory messId={messId} monthId={monthId} mode={mode} />
        <MemberBalances members={members} mode={mode} />
      </div>
    </div>
  );
}
