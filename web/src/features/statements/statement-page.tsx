"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useHistory, useMembers, useMessInfo, useStatement } from "@/features/dashboard/api";
import { Balance, MonthPicker, OverdueBadge, is404 } from "@/features/dashboard/shared";
import type { AppLocale } from "@/i18n/config";
import type { StatementLine, StatementLineKind } from "@/lib/api/contract";
import { formatDate, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { fieldClass } from "@/components/ui/field";

/** Kinds whose server `label` is a meaningful name (bill category) and is shown as the main text. */
const NAMED_KINDS: StatementLineKind[] = ["fixed_bill"];
/** Kinds where the server label carries a note worth showing under the translated name. */
const NOTED_KINDS: StatementLineKind[] = ["own_pocket_expense", "adjustment", "doesnt_pay_in", "final_payout", "recoverable_repay", "opening"];

export function StatementPage({ memberId = null, initialMonthId = null }: { memberId?: number | null; initialMonthId?: number | null }) {
  const { messId } = useMess();
  const t = useTranslations("statements");
  const locale = useLocale() as AppLocale;

  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const historyQ = useHistory(messId);
  const [pickedMember, setPickedMember] = useState<number | null>(null);
  const [pickedMonth, setPickedMonth] = useState<number | null>(initialMonthId);

  const effectiveMember = pickedMember ?? memberId ?? messQ.data?.me.id ?? null;
  const stmtQ = useStatement(messId, effectiveMember, pickedMonth);

  const mode = messQ.data?.mess.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, mode);
  const s = stmtQ.data;

  const kindLabel = (l: StatementLine) => (NAMED_KINDS.includes(l.kind) && l.label ? l.label : t(`kinds.${l.kind}`));
  const kindNote = (l: StatementLine) => (NOTED_KINDS.includes(l.kind) && l.label ? l.label : null);

  const members = membersQ.data ?? [];
  const controls = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor="stmt-member" className="text-sm font-medium">{t("member.label")}</label>
        <select
          id="stmt-member"
          className={fieldClass}
          value={effectiveMember ?? ""}
          disabled={members.length === 0}
          onChange={(e) => setPickedMember(Number(e.target.value))}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.display_name}{m.archived_at ? ` (${t("member.archived")})` : ""}</option>
          ))}
        </select>
      </div>
      <MonthPicker selected={pickedMonth ?? s?.month.id ?? null} current={s?.month} history={historyQ.data} onChange={setPickedMonth} />
    </div>
  );

  const title = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-bold">{s ? t("titleFor", { name: s.member.display_name }) : t("title")}</h1>
      <div className="flex gap-4 text-sm font-medium text-accent underline">
        <Link href={`/${messId}${s ? `?month=${s.month.id}` : ""}`}>{t("links.dashboard")}</Link>
        <Link href={`/${messId}/history`}>{t("links.history")}</Link>
      </div>
    </div>
  );

  if (stmtQ.isError) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        {title}
        {controls}
        <p role="alert" className="text-danger">{is404(stmtQ.error) ? t("errors.notFound") : t("errors.loadFailed")}</p>
      </div>
    );
  }
  if (!s) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
        {title}
        {controls}
        <p role="status" className="text-muted">{t("loading")}</p>
      </div>
    );
  }

  const carryIn = s.carry_in_paisa;
  const rest = s.lines.filter((l) => l.kind !== "carry_in");
  const sections: { key: "fixed" | "meals" | "other"; lines: StatementLine[] }[] = [
    { key: "fixed", lines: rest.filter((l) => l.group === "fixed") },
    { key: "meals", lines: rest.filter((l) => l.group === "meals") },
    { key: "other", lines: rest.filter((l) => l.group === null) },
  ];

  const lineRow = (l: StatementLine, i: number) => (
    <li key={`${l.kind}-${i}`} className="flex items-start justify-between gap-3 py-2" data-testid={`line-${l.kind}`}>
      <div className="min-w-0">
        <p className="font-medium">{kindLabel(l)}</p>
        {kindNote(l) ? <p className="text-xs text-muted">{kindNote(l)}</p> : null}
        {l.date ? <p className="text-xs text-muted">{formatDate(l.date, locale)}</p> : null}
      </div>
      <span className={l.amount_paisa < 0 ? "text-danger" : "text-success"}>{money(l.amount_paisa)}</span>
    </li>
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">
      {title}
      {controls}

      {!s.member.is_active ? <p role="note" className="text-sm text-muted">{t("inactive")}</p> : null}

      <section aria-labelledby="stmt-summary" className="rounded-2xl border border-default-200 bg-surface p-4">
        <h2 id="stmt-summary" className="sr-only">{t("summary.title")}</h2>
        <p className="text-sm text-muted">{t("summary.total")}</p>
        <p className="text-3xl" data-testid="stmt-total"><Balance paisa={s.total_paisa} mode={mode} /></p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted">{t("summary.fixedBalance")}</dt>
          <dd className="text-end" data-testid="stmt-fixed-balance"><Balance paisa={s.fixed_balance_paisa} mode={mode} /></dd>
          <dt className="text-muted">{t("summary.mealsBalance")}</dt>
          <dd className="text-end" data-testid="stmt-meals-balance"><Balance paisa={s.meals_balance_paisa} mode={mode} /></dd>
          <dt className="text-muted">{t("summary.outstanding")}</dt>
          <dd className="text-end" data-testid="stmt-outstanding">{money(s.fixed_outstanding_paisa)}</dd>
          <dt className="text-muted">{t("summary.depositRequired")}</dt>
          <dd className="text-end">{money(s.deposit_required_paisa)}</dd>
          <dt className="text-muted">{t("summary.depositOutstanding")}</dt>
          <dd className="text-end" data-testid="stmt-deposit-outstanding">{money(s.deposit_outstanding_paisa)}</dd>
        </dl>
        {s.fixed_overdue_days > 0 || s.deposit_overdue_days > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <OverdueBadge days={s.fixed_overdue_days} kind="fixed" />
            <OverdueBadge days={s.deposit_overdue_days} kind="deposit" />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="stmt-lines" className="rounded-2xl border border-default-200 bg-surface p-4">
        <h2 id="stmt-lines" className="text-lg font-semibold">{t("lines.title")}</h2>
        <ul className="divide-y divide-default-200">
          <li className="flex items-start justify-between gap-3 py-2" data-testid="line-carry_in">
            <p className="font-medium">{t("kinds.carry_in")}</p>
            <span className={carryIn < 0 ? "text-danger" : carryIn > 0 ? "text-success" : "text-muted"}>{money(carryIn)}</span>
          </li>
        </ul>
        {rest.length === 0 ? <p className="mt-2 text-muted">{t("lines.empty")}</p> : null}
        {sections.map((sec) =>
          sec.lines.length === 0 ? null : (
            <div key={sec.key} className="mt-3" data-testid={`section-${sec.key}`}>
              <h3 className="text-sm font-semibold text-muted">{t(`groups.${sec.key}`)}</h3>
              <ul className="divide-y divide-default-200">{sec.lines.map(lineRow)}</ul>
            </div>
          ),
        )}
      </section>
    </div>
  );
}
