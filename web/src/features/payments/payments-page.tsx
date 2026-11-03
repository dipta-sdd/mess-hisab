"use client";

import { Button, Modal } from "@heroui/react";
import { RowMenu } from "@/components/ui/row-menu";
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
import { fieldClassInvalid } from "@/components/ui/field";

/** Payments grouped by day, keeping the order the API returned them in. */
function byDay(payments: Payment[]): Array<{ day: string; items: Payment[] }> {
  const days: Array<{ day: string; items: Payment[] }> = [];
  for (const p of payments) {
    const last = days[days.length - 1];
    if (last && last.day === p.paid_on) last.items.push(p);
    else days.push({ day: p.paid_on, items: [p] });
  }
  return days;
}

type FormState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; payment: Payment };

/** `scope="own"` is the member page (just the signed-in member's payments); `scope="all"` is the admin page with recording and editing. */
export function PaymentsPage({ scope = "own" }: { scope?: "own" | "all" }) {
  const { messId } = useMess();
  const t = useTranslations("payments");
  const locale = useLocale() as AppLocale;

  const all = scope === "all";
  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId, all);
  const monthsQ = useMonths(messId);
  const currentQ = useCurrentMonth(messId);
  const cashQ = useCash(messId);

  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const [memberFilter, setMemberFilter] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>({ mode: "closed" });
  const [notice, setNotice] = useState<string | null>(null);

  // Newest first, so "older" is the next index.
  const months = [...(monthsQ.data ?? [])].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const monthId = pickedMonth ?? currentQ.data?.id ?? (currentQ.isError ? (months[0]?.id ?? null) : null);
  const month = months.find((m) => m.id === monthId) ?? (currentQ.data?.id === monthId ? currentQ.data : undefined);
  const paymentsQ = usePayments(messId, monthId, all ? memberFilter : (messQ.data?.me.id ?? null));

  const mess = messQ.data?.mess;
  const isStaff = all && Boolean(messQ.data?.me.is_manager || messQ.data?.me.is_admin);
  const isManager = isStaff;
  const mode = mess?.rounding_mode ?? "two_decimals";
  const members = all ? (membersQ.data ?? []) : messQ.data ? [messQ.data.me] : [];
  const nameOf = (id: number | null) => members.find((m) => m.id === id)?.display_name ?? t("list.unknownMember");

  const payments = paymentsQ.data ?? [];
  const totals: Record<Group, number> = { fixed: 0, meals: 0 };
  for (const p of payments) totals[p.group] += p.amount_paisa;

  const monthIndex = months.findIndex((m) => m.id === monthId);
  const olderMonth = monthIndex >= 0 ? months[monthIndex + 1] : undefined;
  const newerMonth = monthIndex > 0 ? months[monthIndex - 1] : undefined;

  const loading = messQ.isPending || monthsQ.isPending || currentQ.isPending || (monthId !== null && paymentsQ.isPending);
  const loadFailed = messQ.isError || monthsQ.isError || paymentsQ.isError || (currentQ.isError && months.length === 0 && !monthsQ.isPending);
  const money = (paisa: number) => formatMoney(paisa, locale, mode);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {isManager ? (
          <Button variant="primary" className="min-h-11" onPress={() => { setNotice(null); setForm({ mode: "create" }); }}>
            {t("actions.record")}
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="cash-label" className="rounded-2xl border border-border bg-surface p-4">
        <p id="cash-label" className="text-sm text-muted">{t("cash.label")}</p>
        <p className="text-3xl font-bold" data-testid="cash-pool">
          {cashQ.data ? money(cashQ.data.pool_balance_paisa) : "…"}
        </p>
        <p className="text-sm text-muted">{t("cash.hint")}</p>
      </section>

      {isManager ? (
        <Modal isOpen={form.mode !== "closed"} onOpenChange={(open) => (open ? undefined : setForm({ mode: "closed" }))}>
          <Modal.Backdrop>
            <Modal.Container placement="center" size="md">
              <Modal.Dialog aria-label={form.mode === "edit" ? t("form.editTitle") : t("form.createTitle")} className="max-h-[92dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {form.mode !== "closed" ? (
                  <PaymentForm
                    key={form.mode === "edit" ? form.payment.id : "new"}
                    bare
                    messId={messId}
                    members={members}
                    payment={form.mode === "edit" ? form.payment : undefined}
                    onCancel={() => setForm({ mode: "closed" })}
                    onDone={() => setForm({ mode: "closed" })}
                  />
                ) : null}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-1" data-testid="month-stepper">
          <Button isIconOnly variant="ghost" aria-label={t("month.prev")} isDisabled={!olderMonth} onPress={() => olderMonth && setPickedMonth(olderMonth.id)} className="size-11">
            <span aria-hidden="true">‹</span>
          </Button>
          <div className="min-w-36 text-center">
            <p className="font-semibold">{month ? formatMonthLabel(month.starts_on, locale) : "…"}</p>
            {month ? <p className="text-sm text-muted">{month.status === "open" ? t("month.open") : t("month.closed")}</p> : null}
          </div>
          <Button isIconOnly variant="ghost" aria-label={t("month.next")} isDisabled={!newerMonth} onPress={() => newerMonth && setPickedMonth(newerMonth.id)} className="size-11">
            <span aria-hidden="true">›</span>
          </Button>
        </div>

        <section aria-labelledby="totals-title" className="flex gap-6">
          <h2 id="totals-title" className="sr-only">{t("totals.title")}</h2>
          {(["fixed", "meals"] as const).map((g) => (
            <div key={g} data-testid={`total-${g}`}>
              <p className="text-sm text-muted">{t(`groups.${g}`)}</p>
              <p className="text-lg font-semibold tabular-nums">{money(totals[g])}</p>
            </div>
          ))}
        </section>
      </div>

      {isStaff ? (
        <div>
          <label htmlFor="member-filter" className="sr-only">{t("filter.label")}</label>
          <select
            id="member-filter"
            className={`${fieldClassInvalid} min-h-9 w-auto py-1 text-sm`}
            value={memberFilter ?? ""}
            onChange={(e) => setMemberFilter(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">{t("filter.all")}</option>
            {members.map((m: Member) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </div>
      ) : null}

      {notice ? <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">{notice}</div> : null}

      <section aria-labelledby="list-title" className="flex flex-col gap-4">
        <h2 id="list-title" className="sr-only">
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
          byDay(payments).map(({ day, items }) => (
            <div key={day} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted">{formatDate(day, locale)}</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {items.map((p) => (
                  <PaymentRow
                    key={p.id}
                    payment={p}
                    memberName={nameOf(p.member_id)}
                    receivedBy={p.received_by_member_id ? nameOf(p.received_by_member_id) : null}
                    money={money}
                    canManage={isManager && month?.status !== "closed"}
                    onEdit={() => { setNotice(null); setForm({ mode: "edit", payment: p }); }}
                    onError={setNotice}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function PaymentRow({
  payment,
  memberName,
  receivedBy,
  money,
  canManage,
  onEdit,
  onError,
}: {
  payment: Payment;
  memberName: string;
  receivedBy: string | null;
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

  const label = `${memberName} ${money(payment.amount_paisa)}`;
  const menu = canManage ? (
    <RowMenu
      label={`${t("actions.menu")}: ${label}`}
      actions={[
        { id: "edit", label: t("actions.edit"), ariaLabel: `${t("actions.edit")}: ${memberName}`, onAction: onEdit },
        { id: "delete", label: t("actions.delete"), ariaLabel: `${t("actions.delete")}: ${memberName}`, danger: true, onAction: () => setConfirming(true) },
      ]}
    />
  ) : null;

  return (
    <li className="px-4 py-3" data-testid={`payment-${payment.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{memberName}</p>
          <p className="text-sm text-muted">
            {t(`groups.${payment.group}`)}
            {receivedBy ? ` · ${t("list.receivedBy", { name: receivedBy })}` : ""}
          </p>
          {payment.note ? <p className="mt-1 break-words text-sm">{payment.note}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <p className="text-lg font-semibold tabular-nums">{money(payment.amount_paisa)}</p>
          {menu}
        </div>
      </div>
      {confirming ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm">{t("actions.confirmDelete")}</span>
          <Button size="sm" variant="danger" onPress={remove} isDisabled={del.isPending}>
            {t("actions.confirmYes")}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setConfirming(false)}>
            {t("actions.cancel")}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
