"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import { formatDate, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useDashboard, useHistory, useMessInfo } from "./api";
import { HowItAdds, PaidThisMonth } from "./member-breakdown";
import { MonthPicker, is404 } from "./shared";

export function MemberDashboard({ memberId, initialMonthId = null }: { memberId: number; initialMonthId?: number | null }) {
  const { messId } = useMess();
  const t = useTranslations("dashboard");
  const locale = useLocale() as AppLocale;

  const [picked, setPicked] = useState<number | null>(initialMonthId);
  const messQ = useMessInfo(messId);
  const historyQ = useHistory(messId);
  const dashQ = useDashboard(messId, picked, true);

  const mode = messQ.data?.mess.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, mode);
  const data = dashQ.data;
  const trackMeals = messQ.data?.mess.meal_tracking !== "off";

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
  const shell = "mx-auto flex w-full max-w-2xl flex-col gap-4 p-4";

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

  const { totals, month } = data;
  const row = data.members.find((m) => m.member_id === memberId) ?? data.members[0];
  const statusLabel = month.status === "open" ? t("month.open") : t("month.closed");
  const statementHref = `/${messId}/statements/${memberId}?month=${month.id}`;

  // Meal costs are only settled when the month closes, so until then the headline is the fixed balance alone.
  const settledAtClose = month.status === "open";
  const balance = (settledAtClose ? row?.fixed_balance_paisa : row?.balance_paisa) ?? 0;
  const tone = balance < 0 ? "text-danger" : balance > 0 ? "text-success" : "text-muted";
  const headline =
    balance < 0 ? t("member.owe", { amount: money(-balance) })
    : balance > 0 ? t("member.getBack", { amount: money(balance) })
    : t("member.settled");

  const mini: { key: string; label: string; value: string }[] = [
    ...(trackMeals ? [{ key: "meal-rate", label: t("member.mess.mealRate"), value: money(totals.meal_rate_paisa) }] : []),
    { key: "bazar", label: t("member.mess.totalBazar"), value: money(totals.meals_expenses_paisa) },
    { key: "cash", label: t("member.mess.cash"), value: money(data.cash_pool_paisa) },
  ];

  return (
    <div className={shell}>
      {header}
      {picker}
      <p className="text-sm text-muted" data-testid="month-status">
        {t("month.status", { status: statusLabel })}
        {month.fixed_deadline ? ` · ${t("month.fixedDeadline", { date: formatDate(month.fixed_deadline, locale) })}` : ""}
      </p>

      {row ? (
        <>
          <section aria-labelledby="my-balance" className="rounded-2xl border border-border bg-surface p-5" data-testid="balance-card">
            <h2 id="my-balance" className="sr-only">{t("member.title")}</h2>
            <p className={`text-3xl font-bold tabular-nums ${tone}`} data-testid="balance-headline">{headline}</p>
            {settledAtClose && row.meals_balance_paisa !== 0 ? (
              <p className="mt-1 text-sm text-muted" data-testid="meals-pending">
                {t(row.meals_balance_paisa < 0 ? "member.mealsPendingDue" : "member.mealsPendingCredit", { amount: money(Math.abs(row.meals_balance_paisa)) })}
              </p>
            ) : null}
            {row.fixed_outstanding_paisa > 0 && month.fixed_deadline ? (
              <p className="mt-2 text-sm text-muted" data-testid="pay-fixed">
                {t("member.payByDeadline", { amount: money(row.fixed_outstanding_paisa), date: formatDate(month.fixed_deadline, locale) })}
              </p>
            ) : null}
          </section>

          <PaidThisMonth row={row} money={money} />
          <HowItAdds row={row} totals={totals} money={money} locale={locale} trackMeals={trackMeals} statementHref={statementHref} />
        </>
      ) : (
        <p className="text-muted">{t("member.noRow")}</p>
      )}

      <section aria-labelledby="mess-title" className="flex flex-col gap-2">
        <h2 id="mess-title" className="text-sm font-semibold text-muted">{t("member.mess.title")}</h2>
        <dl className={`grid gap-2 ${trackMeals ? "grid-cols-3" : "grid-cols-2"}`}>
          {mini.map((s) => (
            <div key={s.key} className="rounded-xl border border-border bg-surface p-2" data-testid={`mini-${s.key}`}>
              <dt className="text-sm text-muted">{s.label}</dt>
              <dd className="break-words text-sm font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
