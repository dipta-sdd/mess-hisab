"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Tabs } from "@heroui/react";
import { ReportsPage } from "@/features/reports/report-page";
import { useHistory, useMembers, useMessInfo, useStatement } from "@/features/dashboard/api";
import { Balance, OverdueBadge, is404 } from "@/features/dashboard/shared";
import type { AppLocale } from "@/i18n/config";
import type { StatementLine, StatementLineKind } from "@/lib/api/contract";
import { formatDate, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { fieldClassInvalid } from "@/components/ui/field";
import { MonthStepper, type StepperMonth } from "@/components/ui/month-stepper";
import { BalanceByMonth } from "./charts";

/** Kinds whose server `label` is a meaningful name (bill category) and is shown as the main text. */
const NAMED_KINDS: StatementLineKind[] = ["fixed_bill"];
/** Kinds where the server label carries a note worth showing under the translated name. */
const NOTED_KINDS: StatementLineKind[] = ["own_pocket_expense", "adjustment", "doesnt_pay_in", "final_payout", "recoverable_repay", "opening"];

type Tab = "statement" | "report";

/** Statement and the mess-wide monthly report, as two tabs sharing the picked month. */
export function StatementPage({ memberId = null, initialMonthId = null, initialTab = "statement" }: { memberId?: number | null; initialMonthId?: number | null; initialTab?: Tab }) {
  const t = useTranslations("statements");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [pickedMonth, setPickedMonth] = useState<number | null>(initialMonthId);
  return (
    <div className="flex w-full flex-col gap-6">
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as Tab)} className="w-full">
        <Tabs.List aria-label={t("tabs.label")}>
          <Tabs.Tab id="statement">{t("tabs.statement")}<Tabs.Indicator /></Tabs.Tab>
          <Tabs.Tab id="report">{t("tabs.report")}<Tabs.Indicator /></Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel id="statement" className="pt-6">
          <StatementTab memberId={memberId} pickedMonth={pickedMonth} setPickedMonth={setPickedMonth} />
        </Tabs.Panel>
        <Tabs.Panel id="report" className="pt-6">
          <ReportsPage embedded monthId={pickedMonth} onMonthChange={setPickedMonth} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function StatementTab({ memberId, pickedMonth, setPickedMonth }: { memberId: number | null; pickedMonth: number | null; setPickedMonth: (id: number | null) => void }) {
  const { messId } = useMess();
  const t = useTranslations("statements");
  const locale = useLocale() as AppLocale;

  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const historyQ = useHistory(messId);
  const [pickedMember, setPickedMember] = useState<number | null>(null);

  const effectiveMember = pickedMember ?? memberId ?? messQ.data?.me.id ?? null;
  const stmtQ = useStatement(messId, effectiveMember, pickedMonth);

  const mode = messQ.data?.mess.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, mode);
  const s = stmtQ.data;

  const kindLabel = (l: StatementLine) => (NAMED_KINDS.includes(l.kind) && l.label ? l.label : t(`kinds.${l.kind}`));
  const kindNote = (l: StatementLine) => (NOTED_KINDS.includes(l.kind) && l.label ? l.label : null);

  const members = membersQ.data ?? [];
  const stepperMonths: StepperMonth[] = historyQ.data && historyQ.data.length > 0
    ? historyQ.data.map((h) => ({ id: h.month_id, starts_on: h.starts_on, status: h.status }))
    : s ? [{ id: s.month.id, starts_on: s.month.starts_on, status: s.month.status }] : [];
  const controls = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex w-full flex-col gap-1 sm:w-64">
        <label htmlFor="stmt-member" className="text-sm font-medium">{t("member.label")}</label>
        <select
          id="stmt-member"
          className={fieldClassInvalid}
          value={effectiveMember ?? ""}
          disabled={members.length === 0}
          onChange={(e) => setPickedMember(Number(e.target.value))}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.display_name}{m.archived_at ? ` (${t("member.archived")})` : ""}</option>
          ))}
        </select>
      </div>
      <MonthStepper
        months={stepperMonths}
        selectedId={pickedMonth ?? s?.month.id ?? null}
        onChange={setPickedMonth}
        labels={{ prev: t("stepper.prev"), next: t("stepper.next"), open: t("stepper.open"), closed: t("stepper.closed") }}
      />
    </div>
  );

  const title = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-semibold">{s ? t("titleFor", { name: s.member.display_name }) : t("title")}</h1>
      <div className="flex gap-4 text-sm font-medium text-accent underline">
        <Link href={`/${messId}${s ? `?month=${s.month.id}` : ""}`}>{t("links.dashboard")}</Link>
        <Link href={`/${messId}/history`}>{t("links.history")}</Link>
      </div>
    </div>
  );

  if (stmtQ.isError) {
    return (
      <div className="flex w-full flex-col gap-6">
        {title}
        {controls}
        <p role="alert" className="text-danger">{is404(stmtQ.error) ? t("errors.notFound") : t("errors.loadFailed")}</p>
      </div>
    );
  }
  if (!s) {
    return (
      <div className="flex w-full flex-col gap-6">
        {title}
        {controls}
        <p role="status" className="text-muted">{t("loading")}</p>
      </div>
    );
  }

  const carryIn = s.carry_in_paisa;
  const rest = s.lines.filter((l) => l.kind !== "carry_in");
  // Passbook order: charges without a date post at the start of the month, then dated lines by date.
  const groupRank = (l: StatementLine) => (l.group === "fixed" ? 0 : l.group === "meals" ? 1 : 2);
  const ordered = rest
    .map((l, i) => ({ l, i }))
    .sort((a, b) => (a.l.date ?? "").localeCompare(b.l.date ?? "") || groupRank(a.l) - groupRank(b.l) || a.i - b.i)
    .map((x) => x.l);
  let running = carryIn;
  const entries = ordered.map((l) => ({ l, balance: (running += l.amount_paisa) }));
  const tone = (n: number) => (n < 0 ? "text-danger" : n > 0 ? "text-success" : "text-muted");
  const cols = "grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-start gap-x-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem]";

  const lineRow = ({ l, balance }: { l: StatementLine; balance: number }, i: number) => (
    <li key={`${l.kind}-${i}`} className={cols} data-testid={`line-${l.kind}`}>
      <div className="min-w-0">
        <p className="break-words font-medium">{kindLabel(l)}</p>
        <p className="break-words text-sm text-muted">
          {[l.group ? t(`groups.${l.group}`) : null, l.date ? formatDate(l.date, locale) : null, kindNote(l)].filter(Boolean).join(" · ")}
        </p>
      </div>
      <span className={`text-end tabular-nums ${tone(l.amount_paisa)}`}>{money(l.amount_paisa)}</span>
      <span className={`text-end tabular-nums text-muted`}>{money(balance)}</span>
    </li>
  );

  return (
    <div className="flex w-full flex-col gap-6">
      {title}
      {controls}

      {!s.member.is_active ? <p role="note" className="text-sm text-muted">{t("inactive")}</p> : null}

      <section aria-labelledby="stmt-summary" className="overflow-hidden rounded-2xl border border-border bg-surface">
        <h2 id="stmt-summary" className="sr-only">{t("summary.title")}</h2>
        <dl className="grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x rtl:md:divide-x-reverse">
          <div className="col-span-2 flex flex-col gap-1 border-b border-border p-4 md:col-span-1 md:border-b-0">
            <dt className="text-sm text-muted">{t("summary.total")}</dt>
            <dd className="break-words text-2xl font-semibold" data-testid="stmt-total"><Balance paisa={s.total_paisa} mode={mode} /></dd>
            {s.fixed_overdue_days > 0 || s.deposit_overdue_days > 0 ? (
              <div className="mt-1 flex flex-wrap gap-2">
                <OverdueBadge days={s.fixed_overdue_days} kind="fixed" />
                <OverdueBadge days={s.deposit_overdue_days} kind="deposit" />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 p-4">
            <dt className="text-sm text-muted">{t("summary.fixedBalance")}</dt>
            <dd data-testid="stmt-fixed-balance"><Balance paisa={s.fixed_balance_paisa} mode={mode} /></dd>
            <dd className="text-sm text-muted">{t("summary.outstanding")}: <span className="tabular-nums" data-testid="stmt-outstanding">{money(s.fixed_outstanding_paisa)}</span></dd>
          </div>
          <div className="flex flex-col gap-1 border-s border-border p-4 md:border-s-0">
            <dt className="text-sm text-muted">{t("summary.mealsBalance")}</dt>
            <dd data-testid="stmt-meals-balance"><Balance paisa={s.meals_balance_paisa} mode={mode} /></dd>
          </div>
          <div className="col-span-2 flex flex-col gap-1 border-t border-border p-4 md:col-span-1 md:border-t-0">
            <dt className="text-sm text-muted">{t("summary.depositRequired")}</dt>
            <dd className="tabular-nums">{money(s.deposit_required_paisa)}</dd>
            <dd className="text-sm text-muted">{t("summary.depositOutstanding")}: <span className="tabular-nums" data-testid="stmt-deposit-outstanding">{money(s.deposit_outstanding_paisa)}</span></dd>
          </div>
        </dl>
      </section>

      {effectiveMember !== null ? <BalanceByMonth messId={messId} memberId={effectiveMember} mode={mode} /> : null}

      <section aria-labelledby="stmt-lines" className="flex flex-col gap-3">
        <h2 id="stmt-lines" className="text-lg font-semibold">{t("lines.title")}</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className={`${cols} border-b border-border bg-default/50 py-2 text-sm font-medium text-muted`} aria-hidden="true">
            <span />
            <span className="text-end">{t("lines.amount")}</span>
            <span className="text-end">{t("lines.balance")}</span>
          </div>
          <ul className="divide-y divide-border">
            <li className={cols} data-testid="line-carry_in">
              <p className="font-medium">{t("kinds.carry_in")}</p>
              <span />
              <span className={`text-end tabular-nums ${tone(carryIn)}`}>{money(carryIn)}</span>
            </li>
            {entries.map(lineRow)}
          </ul>
          {rest.length === 0 ? <p className="border-t border-border px-4 py-3 text-muted">{t("lines.empty")}</p> : null}
          <div className={`${cols} border-t border-border bg-default/50 font-semibold`}>
            <span>{t("lines.closing")}</span>
            <span />
            <span className={`text-end tabular-nums ${tone(s.total_paisa)}`}>{money(s.total_paisa)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
