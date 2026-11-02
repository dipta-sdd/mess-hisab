"use client";

import { useLocale, useTranslations } from "next-intl";
import { ChartCard, ColumnChart, DivergingBars, LineChart } from "@/components/charts";
import { useMemberHistory } from "@/features/dashboard/api";
import type { AppLocale } from "@/i18n/config";
import type { HistoryRow, RoundingMode } from "@/lib/api/contract";
import { formatBalance, formatMonthLabel, formatMonthTick, formatMoney } from "@/lib/format";

/** Whole-taka axis ticks: nice steps are multiples of ৳1, so nothing is rounded away. */
const tick = (locale: AppLocale) => (paisa: number) => formatMoney(paisa, locale, "whole_taka");

/** Meal rate (line) and expenses (columns) per month. `rows` is newest first, as the API returns it. */
export function HistoryCharts({ rows, mode }: { rows: HistoryRow[]; mode: RoundingMode }) {
  const t = useTranslations("statements");
  const locale = useLocale() as AppLocale;
  const money = (paisa: number) => formatMoney(paisa, locale, mode);
  const ordered = [...rows].reverse();
  const common = { showTableLabel: t("charts.showTable"), hideTableLabel: t("charts.hideTable") };
  const note = ordered.length === 1 ? t("charts.trendNote") : undefined;
  const hasRate = ordered.some((r) => r.total_meals_centi > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard
        {...common}
        testId="chart-meal-rate"
        title={t("charts.mealRate.title")}
        subtitle={t("charts.mealRate.subtitle")}
        note={note}
        table={{
          headers: [t("charts.mealRate.month"), t("charts.mealRate.rate")],
          rows: ordered.map((r) => [
            formatMonthLabel(r.starts_on, locale),
            r.total_meals_centi > 0 ? money(r.meal_rate_paisa) : t("charts.mealRate.noMeals"),
          ]),
        }}
        empty={hasRate ? undefined : t("charts.mealRate.noMeals")}
      >
        <LineChart
          ariaLabel={t("charts.mealRate.title")}
          formatTick={tick(locale)}
          minStep={100}
          points={ordered.map((r) => {
            const label = formatMonthLabel(r.starts_on, locale);
            const has = r.total_meals_centi > 0;
            return { key: r.month_id, label, tickLabel: formatMonthTick(r.starts_on, locale), value: has ? r.meal_rate_paisa : null, valueLabel: has ? money(r.meal_rate_paisa) : t("charts.mealRate.noMeals") };
          })}
        />
      </ChartCard>

      <ChartCard
        {...common}
        testId="chart-expenses"
        title={t("charts.expenses.title")}
        subtitle={t("charts.expenses.subtitle")}
        note={note}
        table={{
          headers: [t("charts.expenses.month"), t("charts.expenses.amount")],
          rows: ordered.map((r) => [formatMonthLabel(r.starts_on, locale), money(r.expenses_paisa)]),
        }}
      >
        <ColumnChart
          ariaLabel={t("charts.expenses.title")}
          formatTick={tick(locale)}
          minStep={100}
          items={ordered.map((r) => ({ key: r.month_id, label: formatMonthLabel(r.starts_on, locale), tickLabel: formatMonthTick(r.starts_on, locale), value: r.expenses_paisa, valueLabel: money(r.expenses_paisa) }))}
        />
      </ChartCard>
    </div>
  );
}

/** The viewed member's balance for each month they were in (oldest to newest, left to right). */
export function BalanceByMonth({ messId, memberId, mode }: { messId: number; memberId: number; mode: RoundingMode }) {
  const t = useTranslations("statements");
  const tc = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const q = useMemberHistory(messId, memberId);
  const common = {
    title: t("charts.balanceByMonth.title"),
    showTableLabel: t("charts.showTable"),
    hideTableLabel: t("charts.hideTable"),
    testId: "chart-balance-by-month",
  };

  if (q.isError) return <ChartCard {...common} empty={t("charts.balanceByMonth.loadFailed")}>{null}</ChartCard>;
  if (!q.data) return <ChartCard {...common} empty={t("loading")}>{null}</ChartCard>;

  const ordered = [...q.data].reverse();
  const label = (paisa: number) => formatBalance(paisa, locale, mode, tc);
  return (
    <ChartCard
      {...common}
      subtitle={t("charts.balanceByMonth.subtitle")}
      empty={ordered.length === 0 ? t("charts.balanceByMonth.empty") : undefined}
      table={{
        headers: [t("charts.balanceByMonth.month"), t("charts.balanceByMonth.balance")],
        rows: ordered.map((r) => [formatMonthLabel(r.starts_on, locale), label(r.balance_paisa)]),
      }}
    >
      <DivergingBars
        orientation="vertical"
        ariaLabel={common.title}
        formatTick={tick(locale)}
        minStep={100}
        items={ordered.map((r) => ({ key: r.month_id, label: formatMonthLabel(r.starts_on, locale), tickLabel: formatMonthTick(r.starts_on, locale), value: r.balance_paisa, valueLabel: label(r.balance_paisa) }))}
      />
    </ChartCard>
  );
}
