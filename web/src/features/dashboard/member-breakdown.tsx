"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import type { DashboardRow, DashboardTotals } from "@/lib/api/contract";
import { formatMeals } from "@/lib/format";

type Props = {
  row: DashboardRow;
  totals: DashboardTotals;
  money: (paisa: number) => string;
  locale: AppLocale;
  /** False when the mess does not count meals, so there is nothing to show about meal counts or a rate. */
  trackMeals: boolean;
};

const RED = "text-danger";
const GREEN = "text-success";

function Line({ id, label, hint, value, tone }: { id?: string; label: string; hint?: string; value: string; tone?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2" data-testid={id}>
      <dt className="min-w-0">
        {label}
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </dt>
      <dd className={`shrink-0 font-medium tabular-nums ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

export function PaidThisMonth({ row, money }: Pick<Props, "row" | "money">) {
  const t = useTranslations("dashboard.member");
  return (
    <section aria-labelledby={`paid-title-${row.member_id}`} className="rounded-2xl border border-border bg-surface p-4" data-testid="paid-card">
      <h2 id={`paid-title-${row.member_id}`} className="mb-2 text-lg font-semibold">{t("paidThisMonth.title")}</h2>
      <dl className="flex flex-col divide-y divide-border">
        <Line id="paid-payments" label={t("paidThisMonth.payments")} value={money(row.paid_paisa)} tone={GREEN} />
        <Line id="paid-pocket-fixed" label={t("paidThisMonth.pocketFixed")} value={money(row.own_pocket_fixed_paisa)} tone={GREEN} />
        <Line id="paid-pocket-meals" label={t("paidThisMonth.pocketMeals")} value={money(row.own_pocket_meals_paisa)} tone={GREEN} />
        <div className="flex items-start justify-between gap-3 py-2 font-semibold" data-testid="paid-total-row">
          <dt>{t("paidThisMonth.total")}</dt>
          <dd className={`shrink-0 tabular-nums ${GREEN}`} data-testid="paid-total">{money(row.paid_paisa + row.own_pocket_paisa)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function HowItAdds({ row, totals, money, locale, trackMeals, statementHref }: Props & { statementHref?: string }) {
  const t = useTranslations("dashboard.member");
  // Anything on the account that isn't a bill, carry-over or what was paid (adjustments, repayments), so the lines always add up to the total.
  const otherPaisa = -(row.balance_paisa - (row.carry_in_paisa + row.paid_paisa + row.own_pocket_paisa - row.fixed_bill_paisa - row.meals_bill_paisa));
  const toClose = -row.balance_paisa;

  return (
    <section aria-labelledby={`breakdown-title-${row.member_id}`} className="rounded-2xl border border-border bg-surface p-4">
      <h2 id={`breakdown-title-${row.member_id}`} className="mb-2 text-lg font-semibold">{t("breakdown.title")}</h2>
      <dl className="flex flex-col divide-y divide-border">
        {trackMeals ? <Line id="line-meals" label={t("breakdown.meals")} value={formatMeals(row.meals_centi, locale)} /> : null}
        <Line
          id="line-meal-bill"
          label={trackMeals ? t("breakdown.mealBill") : t("breakdown.foodBill")}
          hint={trackMeals ? t("breakdown.mealBillHint", { meals: formatMeals(row.meals_centi, locale), rate: money(totals.meal_rate_paisa) }) : undefined}
          value={money(row.meals_bill_paisa)}
          tone={row.meals_bill_paisa > 0 ? RED : undefined}
        />
        <Line id="line-fixed-bill" label={t("breakdown.fixedBill")} value={money(row.fixed_bill_paisa)} tone={row.fixed_bill_paisa > 0 ? RED : undefined} />
        {row.carry_in_paisa !== 0 ? (
          <Line
            id="line-carry"
            label={row.carry_in_paisa < 0 ? t("breakdown.carryDue") : t("breakdown.carryCredit")}
            value={row.carry_in_paisa < 0 ? money(-row.carry_in_paisa) : `− ${money(row.carry_in_paisa)}`}
            tone={row.carry_in_paisa < 0 ? RED : GREEN}
          />
        ) : null}
        <Line id="line-paid" label={t("breakdown.paid")} value={`− ${money(row.paid_paisa)}`} tone={GREEN} />
        {row.own_pocket_fixed_paisa !== 0 ? (
          <Line id="line-pocket-fixed" label={t("breakdown.pocketFixed")} value={`− ${money(row.own_pocket_fixed_paisa)}`} tone={GREEN} />
        ) : null}
        {row.own_pocket_meals_paisa !== 0 ? (
          <Line id="line-pocket-meals" label={t("breakdown.pocketMeals")} value={`− ${money(row.own_pocket_meals_paisa)}`} tone={GREEN} />
        ) : null}
        {otherPaisa !== 0 ? (
          <Line
            id="line-other"
            label={t("breakdown.other")}
            value={otherPaisa < 0 ? money(-otherPaisa) : `− ${money(otherPaisa)}`}
            tone={otherPaisa < 0 ? GREEN : RED}
          />
        ) : null}
      </dl>
      <p className="mt-2 flex items-start justify-between gap-3 border-t border-border pt-3 font-semibold" data-testid="to-close">
        <span>{toClose > 0 ? t("breakdown.toClose") : t("breakdown.getBackAtClose")}</span>
        <span className={`shrink-0 tabular-nums ${toClose > 0 ? RED : toClose < 0 ? GREEN : "text-muted"}`}>{money(Math.abs(toClose))}</span>
      </p>
      {statementHref ? <Link href={statementHref} className="mt-3 inline-block text-sm font-medium text-accent underline">{t("statement")}</Link> : null}
    </section>
  );
}
