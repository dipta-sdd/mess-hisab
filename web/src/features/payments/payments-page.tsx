"use client";

import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { Group, Member, Payment } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useCash, useCurrentMonth, useDeletePayment, useMembers, useMessInfo, useMonths, usePayments } from "./api";
import { formatMonthLabel } from "@/lib/format/date";
import { PaymentForm } from "./payment-form";
import { fieldClass } from "@/components/ui/field";

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; payment: Payment };

export function PaymentsPage() {
  const { messId } = useMess();
  const t = useTranslations("payments");
  const locale = useLocale() as AppLocale;

  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const monthsQ = useMonths(messId);
  const currentQ = useCurrentMonth(messId);
  const cashQ = useCash(messId);

  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const [memberFilter, setMemberFilter] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [notice, setNotice] = useState<string | null>(null);

  const months = monthsQ.data ?? [];
  const monthId = pickedMonth ?? currentQ.data?.id ?? (currentQ.isError ? (months[0]?.id ?? null) : null);
  const month = months.find((m) => m.id === monthId) ?? (currentQ.data?.id === monthId ? currentQ.data : undefined);
  const paymentsQ = usePayments(messId, monthId, memberFilter);

  const mess = messQ.data?.mess;
  const isManager = Boolean(messQ.data?.me.is_manager);
  const mode = mess?.rounding_mode ?? "two_decimals";
  const members = membersQ.data ?? [];
  const nameOf = (id: number | null) => members.find((m) => m.id === id)?.display_name ?? t("list.unknownMember");

  const payments = paymentsQ.data ?? [];
  const totals: Record<Group, number> = { fixed: 0, meals: 0 };
  for (const p of payments) totals[p.group] += p.amount_paisa;

  const loading = messQ.isPending || monthsQ.isPending || currentQ.isPending || (monthId !== null && paymentsQ.isPending);
  const loadFailed = messQ.isError || monthsQ.isError || paymentsQ.isError || (currentQ.isError && months.length === 0 && !monthsQ.isPending);
  const money = (paisa: number) => formatMoney(paisa, locale, mode);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {isManager && form.mode === "closed" ? (
          <Button variant="primary" onPress={() => { setNotice(null); setForm({ mode: "create" }); }}>
            {t("actions.record")}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="cash-label" className="rounded-2xl border border-default-200 bg-surface p-4">
        <p id="cash-label" className="text-sm text-muted">{t("cash.label")}</p>
        <p className="text-3xl font-bold" data-testid="cash-pool">
          {cashQ.data ? money(cashQ.data.pool_balance_paisa) : "…"}
        </p>
        <p className="text-xs text-muted">{t("cash.hint")}</p>
      </section>

      {isManager && form.mode !== "closed" ? (
        <PaymentForm
          key={form.mode === "edit" ? form.payment.id : "new"}
          messId={messId}
          members={members}
          payment={form.mode === "edit" ? form.payment : undefined}
          onCancel={() => setForm({ mode: "closed" })}
          onDone={() => setForm({ mode: "closed" })}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="month-picker" className="text-sm font-medium">{t("month.label")}</label>
          <select
            id="month-picker"
            className={fieldClass}
            value={monthId ?? ""}
            onChange={(e) => setPickedMonth(Number(e.target.value))}
            disabled={months.length === 0}
          >
            {months.map((m) => (
              <option key={m.id} value={m.id}>
                {formatMonthLabel(m.starts_on, locale)} ({m.status === "open" ? t("month.open") : t("month.closed")})
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="member-filter" className="text-sm font-medium">{t("filter.label")}</label>
          <select
            id="member-filter"
            className={fieldClass}
            value={memberFilter ?? ""}
            onChange={(e) => setMemberFilter(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">{t("filter.all")}</option>
            {members.map((m: Member) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </div>
      </div>

      <section aria-labelledby="totals-title" className="grid grid-cols-2 gap-3">
        <h2 id="totals-title" className="sr-only">{t("totals.title")}</h2>
        {(["fixed", "meals"] as const).map((g) => (
          <div key={g} className="rounded-xl border border-default-200 bg-surface p-3" data-testid={`total-${g}`}>
            <p className="text-sm text-muted">{t(`groups.${g}`)}</p>
            <p className="text-lg font-semibold">{money(totals[g])}</p>
          </div>
        ))}
      </section>

      {notice ? <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">{notice}</div> : null}

      <section aria-labelledby="list-title" className="flex flex-col gap-2">
        <h2 id="list-title" className="text-lg font-semibold">
          {t("list.title")}{month ? ` — ${formatMonthLabel(month.starts_on, locale)}` : ""}
        </h2>

        {loadFailed ? (
          <p role="alert" className="text-danger">{t("errors.loadFailed")}</p>
        ) : loading ? (
          <p role="status" className="text-muted">{t("loading")}</p>
        ) : monthId === null ? (
          <p className="text-muted">{t("errors.noMonth")}</p>
        ) : payments.length === 0 ? (
          <p className="text-muted">{t("list.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((p) => (
              <PaymentRow
                key={p.id}
                payment={p}
                memberName={nameOf(p.member_id)}
                receivedBy={p.received_by_member_id ? nameOf(p.received_by_member_id) : null}
                locale={locale}
                money={money}
                canManage={isManager && month?.status !== "closed"}
                onEdit={() => { setNotice(null); setForm({ mode: "edit", payment: p }); }}
                onError={setNotice}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PaymentRow({
  payment,
  memberName,
  receivedBy,
  locale,
  money,
  canManage,
  onEdit,
  onError,
}: {
  payment: Payment;
  memberName: string;
  receivedBy: string | null;
  locale: AppLocale;
  money: (paisa: number) => string;
  canManage: boolean;
  onEdit: () => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("payments");
  const { messId } = useMess();
  const del = useDeletePayment(messId);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    onError(null);
    try {
      await del.mutateAsync(payment.id);
    } catch (error) {
      setConfirming(false);
      if (isApiError(error) && error.isConflict && error.code === "month_closed") onError(t("errors.monthClosed"));
      else if (isApiError(error) && error.isForbidden) onError(t("errors.forbidden"));
      else onError(isApiError(error) && error.message ? error.message : t("errors.generic"));
    }
  }

  return (
    <li className="rounded-xl border border-default-200 bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{memberName}</p>
          <p className="text-sm text-muted">
            {t(`groups.${payment.group}`)} · {formatDate(payment.paid_on, locale)}
          </p>
        </div>
        <p className="shrink-0 text-lg font-semibold">{money(payment.amount_paisa)}</p>
      </div>
      {payment.note ? <p className="mt-1 text-sm break-words">{payment.note}</p> : null}
      {receivedBy ? <p className="mt-1 text-xs text-muted">{t("list.receivedBy", { name: receivedBy })}</p> : null}
      {canManage ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="text-sm">{t("actions.confirmDelete")}</span>
              <Button size="sm" variant="danger" onPress={remove} isDisabled={del.isPending}>
                {t("actions.confirmYes")}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => setConfirming(false)}>
                {t("actions.cancel")}
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" variant="secondary" onPress={onEdit} aria-label={`${t("actions.edit")}: ${memberName}`}>
                {t("actions.edit")}
              </Button>
              <Button size="sm" variant="danger-soft" onPress={() => setConfirming(true)} aria-label={`${t("actions.delete")}: ${memberName}`}>
                {t("actions.delete")}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
