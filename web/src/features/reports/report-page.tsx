"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChartCard, DivergingBars } from "@/components/charts";
import type { AppLocale } from "@/i18n/config";
import type { Month, RoundingMode } from "@/lib/api/contract";
import { ApiError } from "@/lib/api-client/errors";
import { formatDate, formatMeals, formatMonthLabel, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useMonthlyReport, useReportMonths } from "./api";
import { PairedBars, StackedBars, type Series } from "./bars";
import { ReportPrintStyles } from "./print-styles";
import type { MonthlyReport, ReportNextRow } from "./types";

/** Rent = the per-person-amount categories ("Rent" is seeded as fixed_per_person); everything else fixed is "other". */
const isRentLine = (c: { split_type: string }) => c.split_type === "fixed_per_person";

function splitRow(row: ReportNextRow) {
  const rent = row.by_category.filter(isRentLine).reduce((s, c) => s + c.amount_paisa, 0);
  const other = row.by_category.filter((c) => !isRentLine(c)).reduce((s, c) => s + c.amount_paisa, 0);
  return { rent, other, due: row.last_month_due_paisa };
}

export function ReportsPage() {
  const { messId } = useMess();
  const t = useTranslations("reports");
  const locale = useLocale() as AppLocale;
  const monthsQ = useReportMonths(messId);
  const closed: Month[] = (monthsQ.data ?? []).filter((m) => m.status === "closed").sort((a, b) => (a.starts_on < b.starts_on ? 1 : -1));
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked !== null && closed.some((m) => m.id === picked) ? picked : (closed[0]?.id ?? null);
  const reportQ = useMonthlyReport(messId, selected);
  const err = reportQ.error instanceof ApiError ? reportQ.error : null;

  const monthName = (m: Month) => formatMonthLabel(m.starts_on, locale);

  return (
    <div className="report-root mx-auto flex w-full max-w-5xl flex-col gap-4 p-4" data-testid="report-root">
      <ReportPrintStyles />
      <div className="flex flex-wrap items-end justify-between gap-3" data-testid="report-toolbar">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3" data-print="hide">
          {closed.length > 0 ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">{t("monthPicker.label")}</span>
              <select
                className="min-h-11 rounded-lg border border-border bg-surface px-3"
                value={selected ?? ""}
                onChange={(e) => setPicked(Number(e.target.value))}
              >
                {closed.map((m) => (
                  <option key={m.id} value={m.id}>{monthName(m)}</option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!reportQ.data}
            className="min-h-11 rounded-lg bg-accent px-4 font-medium text-accent-foreground disabled:opacity-50"
          >
            {t("download")}
          </button>
        </div>
      </div>
      <p className="text-sm text-muted" data-print="hide">{t("downloadHint")}</p>

      {monthsQ.isError ? (
        <p role="alert" className="text-danger">{err?.isForbidden ? t("forbidden") : t("loadFailed")}</p>
      ) : monthsQ.isPending ? (
        <p role="status" className="text-muted">{t("loading")}</p>
      ) : closed.length === 0 ? (
        <p className="text-muted" data-testid="report-none">{t("monthPicker.none")}</p>
      ) : reportQ.isError ? (
        <Blocked err={err} messId={messId} monthId={selected} locale={locale} nextMonthLabel={nextMonthLabel(closed, selected, locale)} />
      ) : reportQ.isPending || !reportQ.data ? (
        <p role="status" className="text-muted">{t("loading")}</p>
      ) : (
        <ReportBody report={reportQ.data} locale={locale} />
      )}
    </div>
  );
}

/** Best guess of the next month's name for the blocked message: the month right after the picked one. */
function nextMonthLabel(closed: Month[], selected: number | null, locale: AppLocale): string {
  const m = closed.find((x) => x.id === selected);
  if (!m) return "";
  const [y, mo] = m.starts_on.split("-").map(Number);
  const next = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  return formatMonthLabel(next, locale);
}

function Blocked({ err, messId, monthId, locale, nextMonthLabel: nextLabel }: { err: ApiError | null; messId: number; monthId: number | null; locale: AppLocale; nextMonthLabel: string }) {
  const t = useTranslations("reports");
  void locale;
  if (err?.code === "month_not_closed" || err?.code === "next_month_bills_missing") {
    const body = (err.body ?? {}) as { next_month_id?: number | null };
    const target = err.code === "next_month_bills_missing" ? (body.next_month_id ?? monthId) : monthId;
    const label = err.code === "next_month_bills_missing" ? nextLabel : "";
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4" data-testid={`blocked-${err.code}`}>
        <p>{err.code === "month_not_closed" ? t("blocked.month_not_closed") : t("blocked.next_month_bills_missing", { month: label })}</p>
        <Link
          href={`/${messId}/fixed${target ? `?month=${target}` : ""}`}
          className="font-medium text-accent underline"
          data-print="hide"
        >
          {t("blocked.openFixed", { month: label || t("title") })}
        </Link>
      </div>
    );
  }
  return <p role="alert" className="text-danger">{err?.isForbidden ? t("forbidden") : t("loadFailed")}</p>;
}

function Tile({ label, value, hint, tone, testId }: { label: string; value: string; hint?: string; tone?: "danger" | "success"; testId: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3" data-testid={testId}>
      <span className="text-sm text-muted">{label}</span>
      <span className={`text-xl font-bold tabular-nums ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}

function ReportBody({ report, locale }: { report: MonthlyReport; locale: AppLocale }) {
  const t = useTranslations("reports");
  const mode: RoundingMode = report.mess.rounding_mode;
  const money = (p: number) => formatMoney(p, locale, mode);
  const { summary: s, month, members, expenses, meals, next_month: next } = report;
  const common = { showTableLabel: t("charts.showTable"), hideTableLabel: t("charts.hideTable") };
  const nextName = formatMonthLabel(next.month.starts_on, locale);

  const shareSeries: Series[] = [
    { key: "share", label: t("people.share"), className: "bg-accent" },
    { key: "paid", label: t("people.paid"), className: "bg-success" },
  ];
  const nextSeries: Series[] = [
    { key: "rent", label: t("next.rent"), className: "bg-accent" },
    { key: "other", label: t("next.otherFixed"), className: "bg-success" },
    { key: "due", label: t("next.lastDue"), className: "bg-danger" },
  ];

  const nextRows = next.rows.map((r) => ({ row: r, ...splitRow(r) }));
  const grand = next.rows.reduce((sum, r) => sum + r.total_paisa, 0);
  const totals = {
    rent: nextRows.reduce((a, r) => a + r.rent, 0),
    other: nextRows.reduce((a, r) => a + r.other, 0),
    due: nextRows.reduce((a, r) => a + r.due, 0),
  };

  return (
    <>
      {/* 1. Header + summary */}
      <section aria-labelledby="rep-head" className="flex flex-col gap-3" data-testid="section-summary">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{t("header.kicker")}</p>
          <h2 id="rep-head" className="text-xl font-bold">
            {report.mess.name} · {formatMonthLabel(month.starts_on, locale)}
          </h2>
          <p className="text-sm text-muted">
            {t("header.period", { from: formatDate(month.starts_on, locale), to: formatDate(month.ends_on, locale) })}
            {month.closed_at ? ` · ${t("header.closedOn", { date: formatDate(month.closed_at.slice(0, 10), locale) })}` : ""}
            {` · ${t("header.members", { count: s.member_count })}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Tile testId="tile-expenses" label={t("summary.expenses")} value={money(s.expenses_paisa)} hint={t("summary.expensesHint", { count: s.expense_count })} />
          <Tile testId="tile-charged" label={t("summary.charged")} value={money(s.charged_paisa)} />
          <Tile testId="tile-paid" label={t("summary.paid")} value={money(s.paid_paisa)} />
          <Tile testId="tile-due" label={t("summary.due")} value={money(s.total_due_paisa)} tone="danger" />
          <Tile testId="tile-credit" label={t("summary.credit")} value={money(s.total_credit_paisa)} tone="success" />
          {meals ? <Tile testId="tile-meal-rate" label={t("summary.mealRate")} value={money(meals.meal_rate_paisa)} /> : null}
        </div>
      </section>

      {/* 2. Per-person charts */}
      <div className="grid gap-4 md:grid-cols-2" data-testid="section-people">
        <ChartCard
          {...common}
          testId="chart-share-paid"
          title={t("people.title")}
          subtitle={t("people.subtitle")}
          empty={members.length === 0 ? t("people.empty") : undefined}
          table={{
            headers: [t("balances.tableMember"), t("people.share"), t("people.paid")],
            rows: members.map((m) => [m.display_name, money(m.share_paisa), money(m.paid_paisa)]),
          }}
        >
          <PairedBars
            ariaLabel={t("people.title")}
            series={shareSeries}
            items={members.map((m) => ({
              key: m.member_id,
              label: m.display_name,
              values: [
                { value: m.share_paisa, valueLabel: money(m.share_paisa) },
                { value: m.paid_paisa, valueLabel: money(m.paid_paisa) },
              ],
            }))}
          />
        </ChartCard>
        <ChartCard
          {...common}
          testId="chart-balances"
          title={t("balances.title")}
          subtitle={t("balances.subtitle")}
          empty={members.length === 0 ? t("people.empty") : undefined}
          table={{
            headers: [t("balances.tableMember"), t("balances.tableBalance")],
            rows: members.map((m) => [m.display_name, money(m.balance_paisa)]),
          }}
        >
          <DivergingBars
            ariaLabel={t("balances.title")}
            items={members.map((m) => ({ key: m.member_id, label: m.display_name, value: m.balance_paisa, valueLabel: money(m.balance_paisa) }))}
          />
        </ChartCard>
      </div>

      {/* 3. To pay for next month */}
      <section aria-labelledby="rep-next" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-3" data-testid="section-next">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="rep-next" className="text-lg font-semibold">{t("next.title", { month: nextName })}</h2>
            <p className="text-sm text-muted">{t("next.subtitle")}</p>
          </div>
          <p className="rounded-lg border border-border px-3 py-1 text-sm font-medium" data-testid="next-deadline">
            {next.fixed_deadline ? t("next.deadline", { date: formatDate(next.fixed_deadline, locale) }) : t("next.noDeadline")}
          </p>
        </div>
        {next.rows.length === 0 ? (
          <p className="text-muted">{t("next.empty")}</p>
        ) : (
          <>
            <div data-print="keep">
              <h3 className="mb-2 text-sm font-semibold text-muted">{t("next.chartTitle")}</h3>
              <StackedBars
                ariaLabel={t("next.chartTitle")}
                series={nextSeries}
                items={nextRows.map((r) => ({
                  key: r.row.member_id,
                  label: r.row.display_name,
                  total: r.row.total_paisa,
                  totalLabel: money(r.row.total_paisa),
                  segments: [
                    { value: r.rent, valueLabel: money(r.rent) },
                    { value: r.other, valueLabel: money(r.other) },
                    { value: r.due, valueLabel: money(r.due) },
                  ],
                }))}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums" data-testid="next-table">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th scope="col" className="p-2 text-start">{t("next.member")}</th>
                    <th scope="col" className="p-2 text-end">{t("next.rent")}</th>
                    <th scope="col" className="p-2 text-end">{t("next.otherFixed")}</th>
                    <th scope="col" className="p-2 text-end">{t("next.lastDue")}</th>
                    <th scope="col" className="p-2 text-end">{t("next.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {nextRows.map((r) => (
                    <tr key={r.row.member_id} className="border-b border-border" data-testid={`next-row-${r.row.member_id}`}>
                      <th scope="row" className="p-2 text-start font-medium">
                        {r.row.display_name}
                        {r.row.last_month_credit_paisa > 0 ? (
                          <span className="block text-xs font-normal text-muted">{t("next.creditNote", { amount: money(r.row.last_month_credit_paisa) })}</span>
                        ) : null}
                      </th>
                      <td className="p-2 text-end">{money(r.rent)}</td>
                      <td className="p-2 text-end">{money(r.other)}</td>
                      <td className="p-2 text-end">{money(r.due)}</td>
                      <td className="p-2 text-end font-semibold">{money(r.row.total_paisa)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold" data-testid="next-totals">
                    <th scope="row" className="p-2 text-start">{t("next.grandTotal")}</th>
                    <td className="p-2 text-end">{money(totals.rent)}</td>
                    <td className="p-2 text-end">{money(totals.other)}</td>
                    <td className="p-2 text-end">{money(totals.due)}</td>
                    <td className="p-2 text-end" data-testid="next-grand-total">{money(grand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>

      {/* 4. Expenses */}
      <section aria-labelledby="rep-exp" className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3" data-testid="section-expenses">
        <div>
          <h2 id="rep-exp" className="text-lg font-semibold">{t("expenses.title")}</h2>
          <p className="text-sm text-muted">{t("expenses.subtitle")}</p>
        </div>
        {expenses.length === 0 ? (
          <p className="text-muted">{t("expenses.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="p-2 text-start">{t("expenses.date")}</th>
                  <th scope="col" className="p-2 text-start">{t("expenses.category")}</th>
                  <th scope="col" className="p-2 text-start">{t("expenses.paidBy")}</th>
                  <th scope="col" className="p-2 text-start">{t("expenses.note")}</th>
                  <th scope="col" className="p-2 text-end">{t("expenses.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-border" data-testid={`expense-${e.id}`}>
                    <td className="p-2">{formatDate(e.spent_on, locale)}</td>
                    <td className="p-2">{e.category ?? ""}</td>
                    <td className="p-2">{e.payer_name ?? t("expenses.cashPool")}</td>
                    <td className="p-2">{e.note ?? ""}</td>
                    <td className="p-2 text-end">{money(e.amount_paisa)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <th scope="row" colSpan={4} className="p-2 text-start">{t("expenses.total")}</th>
                  <td className="p-2 text-end" data-testid="expenses-total">{money(s.expenses_paisa)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      {/* 5. Meals */}
      {meals ? (
        <section aria-labelledby="rep-meals" className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3" data-testid="section-meals">
          <div>
            <h2 id="rep-meals" className="text-lg font-semibold">{t("meals.title")}</h2>
            <p className="text-sm text-muted">{t("meals.subtitle")}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Tile testId="meals-total" label={t("meals.totalMeals")} value={formatMeals(meals.total_meals_centi, locale)} />
            <Tile testId="meals-rate" label={t("meals.rate")} value={money(meals.meal_rate_paisa)} />
            <Tile testId="meals-food" label={t("meals.foodCost")} value={money(meals.food_cost_paisa)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th scope="col" className="p-2 text-start">{t("meals.member")}</th>
                  <th scope="col" className="p-2 text-end">{t("meals.own")}</th>
                  <th scope="col" className="p-2 text-end">{t("meals.counted")}</th>
                  <th scope="col" className="p-2 text-end">{t("meals.bill")}</th>
                </tr>
              </thead>
              <tbody>
                {meals.members.map((m) => (
                  <tr key={m.member_id} className="border-b border-border" data-testid={`meal-row-${m.member_id}`}>
                    <th scope="row" className="p-2 text-start font-medium">{m.display_name}</th>
                    <td className="p-2 text-end">{formatMeals(m.meals_centi, locale)}</td>
                    <td className="p-2 text-end">{formatMeals(m.effective_meals_centi, locale)}</td>
                    <td className="p-2 text-end">{money(m.meals_bill_paisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

