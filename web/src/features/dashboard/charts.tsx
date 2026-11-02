"use client";

import { useLocale, useTranslations } from "next-intl";
import { BarList, ChartCard, DivergingBars } from "@/components/charts";
import { useCategories, useExpenses } from "@/features/expenses/api";
import type { AppLocale } from "@/i18n/config";
import type { DashboardRow, RoundingMode } from "@/lib/api/contract";
import { formatBalance, formatMoney } from "@/lib/format";

/** Approved expenses of the viewed month, summed per category, largest first. */
export function SpendingByCategory({ messId, monthId, mode }: { messId: number; monthId: number; mode: RoundingMode }) {
  const t = useTranslations("dashboard");
  const locale = useLocale() as AppLocale;
  const expensesQ = useExpenses(messId, { monthId, status: "approved", memberId: null, categoryId: null });
  const categoriesQ = useCategories(messId);

  const title = t("charts.spending.title");
  const common = { title, showTableLabel: t("charts.showTable"), hideTableLabel: t("charts.hideTable"), testId: "chart-spending" };

  if (expensesQ.isError || categoriesQ.isError) {
    return <ChartCard {...common} empty={t("charts.spending.loadFailed")}>{null}</ChartCard>;
  }
  if (!expensesQ.data || !categoriesQ.data) {
    return <ChartCard {...common} empty={t("loading")}>{null}</ChartCard>;
  }

  const names = new Map(categoriesQ.data.map((c) => [c.id, c.name]));
  const totals = new Map<number, number>();
  for (const e of expensesQ.data) totals.set(e.category_id, (totals.get(e.category_id) ?? 0) + e.amount_paisa);
  const rows = [...totals.entries()]
    .map(([id, paisa]) => ({ id, paisa, name: names.get(id) ?? t("charts.spending.unknownCategory") }))
    .sort((a, b) => b.paisa - a.paisa || a.name.localeCompare(b.name));
  const money = (paisa: number) => formatMoney(paisa, locale, mode);

  return (
    <ChartCard
      {...common}
      subtitle={t("charts.spending.subtitle")}
      empty={rows.length === 0 ? t("charts.spending.empty") : undefined}
      table={{
        headers: [t("charts.spending.category"), t("charts.spending.amount")],
        rows: rows.map((r) => [r.name, money(r.paisa)]),
      }}
    >
      <BarList ariaLabel={title} items={rows.map((r) => ({ key: r.id, label: r.name, value: r.paisa, valueLabel: money(r.paisa) }))} />
    </ChartCard>
  );
}

/** Each member's balance for the viewed month; credit (green) right of the line, due (red) left. */
export function MemberBalances({ members, mode }: { members: DashboardRow[]; mode: RoundingMode }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const locale = useLocale() as AppLocale;

  const rows = members
    .filter((m) => !(m.is_archived && m.balance_paisa === 0))
    .sort((a, b) => a.balance_paisa - b.balance_paisa);
  const label = (paisa: number) => formatBalance(paisa, locale, mode, tc);
  const title = t("charts.balances.title");

  return (
    <ChartCard
      title={title}
      subtitle={t("charts.balances.subtitle")}
      showTableLabel={t("charts.showTable")}
      hideTableLabel={t("charts.hideTable")}
      empty={rows.length === 0 ? t("charts.balances.empty") : undefined}
      testId="chart-balances"
      table={{
        headers: [t("charts.balances.member"), t("charts.balances.balance")],
        rows: rows.map((r) => [r.display_name, label(r.balance_paisa)]),
      }}
    >
      <DivergingBars
        ariaLabel={title}
        items={rows.map((r) => ({ key: r.member_id, label: r.display_name, value: r.balance_paisa, valueLabel: label(r.balance_paisa) }))}
      />
    </ChartCard>
  );
}
