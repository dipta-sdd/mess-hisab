"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useCategories, useCurrentMonth, useMembers, useMessInfo, useMonths, useSetup } from "./api";
import { BillCard, fieldClass } from "./bill-card";
import { MemberSettingRow, MonthSetupForm } from "./month-forms";

function formatMonthLabel(startsOn: string, locale: AppLocale): string {
  const [y, m, d] = startsOn.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return startsOn;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-beng" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function FixedPage() {
  const { messId } = useMess();
  const t = useTranslations("fixed");
  const locale = useLocale() as AppLocale;

  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const monthsQ = useMonths(messId);
  const currentQ = useCurrentMonth(messId);
  const categoriesQ = useCategories(messId);

  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const months = monthsQ.data ?? [];
  const monthId = pickedMonth ?? currentQ.data?.id ?? (currentQ.isError ? (months[0]?.id ?? null) : null);
  const setupQ = useSetup(messId, monthId);

  const mess = messQ.data?.mess;
  const isManager = Boolean(messQ.data?.me.is_manager);
  const mode = mess?.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, mode);

  const setup = setupQ.data;
  const month = setup?.month;
  const canEdit = isManager && month?.status === "open";
  const members = (membersQ.data ?? []).filter(
    (m) => month && m.joined_on <= month.ends_on && (m.left_on === null || m.left_on >= month.starts_on),
  );
  const categoryName = (id: number) => categoriesQ.data?.find((c) => c.id === id)?.name ?? t("bill.unknownCategory");
  // By-meal food is split by the meal engine, not by hand, so it has no setup here.
  const bills = (setup?.bills ?? []).filter((b) => b.split_type !== "by_meal");
  const hasByMeal = (setup?.bills ?? []).some((b) => b.split_type === "by_meal");

  const loading = messQ.isPending || membersQ.isPending || monthsQ.isPending || currentQ.isPending || categoriesQ.isPending || (monthId !== null && setupQ.isPending);
  const loadFailed = messQ.isError || membersQ.isError || monthsQ.isError || categoriesQ.isError || setupQ.isError || (currentQ.isError && months.length === 0 && !monthsQ.isPending);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="flex max-w-sm flex-col gap-1">
        <label htmlFor="fixed-month" className="text-sm font-medium">{t("monthPicker.label")}</label>
        <select
          id="fixed-month"
          className={fieldClass}
          value={monthId ?? ""}
          disabled={months.length === 0}
          onChange={(e) => setPickedMonth(Number(e.target.value))}
        >
          {months.map((m) => (
            <option key={m.id} value={m.id}>
              {formatMonthLabel(m.starts_on, locale)} ({m.status === "open" ? t("monthPicker.open") : t("monthPicker.closed")})
            </option>
          ))}
        </select>
      </div>

      {loadFailed ? (
        <p role="alert" className="text-danger">{t("errors.loadFailed")}</p>
      ) : loading ? (
        <p role="status" className="text-muted">{t("loading")}</p>
      ) : monthId === null || !month ? (
        <p className="text-muted">{t("errors.noMonth")}</p>
      ) : (
        <>
          {month.status === "closed" ? (
            <p role="status" className="rounded-lg border border-default-300 bg-surface p-3 text-sm" data-testid="closed-note">{t("closedNote")}</p>
          ) : !isManager ? (
            <p role="status" className="rounded-lg border border-default-300 bg-surface p-3 text-sm" data-testid="readonly-note">{t("readOnlyNote")}</p>
          ) : null}

          <section aria-labelledby="fx-month-title" className="rounded-2xl border border-default-200 bg-surface p-4">
            <h2 id="fx-month-title" className="mb-3 text-lg font-semibold">{t("month.title")}</h2>
            <MonthSetupForm
              key={`${month.id}:${month.fixed_deadline}:${month.deposit_deadline}:${month.deposit_paisa}`}
              messId={messId}
              month={month}
              canEdit={canEdit}
              money={money}
            />
          </section>

          <section aria-labelledby="fx-bills-title" className="flex flex-col gap-3">
            <h2 id="fx-bills-title" className="text-lg font-semibold">{t("bills.title")}</h2>
            {bills.length === 0 ? (
              <p className="text-muted">{t("bills.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {bills.map((bill) => (
                  <BillCard
                    key={`${bill.category_id}:${bill.amount_paisa}:${JSON.stringify(bill.overrides)}`}
                    messId={messId}
                    monthId={month.id}
                    bill={bill}
                    name={categoryName(bill.category_id)}
                    members={members}
                    canEdit={canEdit}
                    money={money}
                  />
                ))}
              </ul>
            )}
            {hasByMeal ? <p className="text-xs text-muted">{t("bills.byMealNote")}</p> : null}
          </section>

          <section aria-labelledby="fx-members-title" className="rounded-2xl border border-default-200 bg-surface p-4">
            <h2 id="fx-members-title" className="text-lg font-semibold">{t("members.title")}</h2>
            <p className="mb-2 text-xs text-muted">{t("members.hint")}</p>
            <ul className="divide-y divide-default-200">
              {members.map((m) => (
                <MemberSettingRow
                  key={`${m.id}:${JSON.stringify(setup?.member_settings.find((s) => s.member_id === m.id) ?? null)}`}
                  messId={messId}
                  month={month}
                  member={m}
                  setting={setup?.member_settings.find((s) => s.member_id === m.id)}
                  canEdit={canEdit}
                  money={money}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
