"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Member, Recoverable } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { useRecoverables, useRepay } from "./api";
import { todayInDhaka } from "@/lib/format/date";
import { parseTakaToPaisa } from "@/lib/format/money-input";
import { Banner, useErrorText } from "./ui";
import { fieldClass } from "@/components/ui/field";

/** All "doesn't pay" requests and unpaid shares of the mess; the manager records repayments. */
export function RecoverablesPanel({
  messId,
  isManager,
  members,
  money,
}: {
  messId: number;
  isManager: boolean;
  members: Member[];
  money: (paisa: number) => string;
}) {
  const t = useTranslations("months.recoverables");
  const recoverables = useRecoverables(messId);
  const nameOf = (id: number) => members.find((m) => m.id === id)?.display_name ?? t("unknownMember");
  const isArchived = (id: number) => Boolean(members.find((m) => m.id === id)?.archived_at);
  const list = recoverables.data ?? [];

  return (
    <section aria-labelledby="rec-title" className="flex flex-col gap-3 rounded-2xl border border-default-200 bg-surface p-4">
      <h2 id="rec-title" className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted">{t("intro")}</p>
      {recoverables.isError ? (
        <Banner>{t("loadFailed")}</Banner>
      ) : recoverables.isPending ? (
        <p role="status" className="text-sm text-muted">{t("loading")}</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => (
            <RecoverableRow key={r.id} messId={messId} r={r} isManager={isManager} money={money} nameOf={nameOf} isArchived={isArchived} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RecoverableRow({
  messId,
  r,
  isManager,
  money,
  nameOf,
  isArchived,
}: {
  messId: number;
  r: Recoverable;
  isManager: boolean;
  money: (paisa: number) => string;
  nameOf: (id: number) => string;
  isArchived: (id: number) => boolean;
}) {
  const t = useTranslations("months.recoverables");
  const [repaying, setRepaying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const debtor = nameOf(r.debtor_member_id);

  return (
    <li className="rounded-xl border border-default-200 p-3" data-testid={`recoverable-${r.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{debtor}</p>
          <p className="text-sm text-muted">{t(`modes.${r.mode}`)}</p>
        </div>
        <span className="rounded-full bg-default-100 px-3 py-1 text-xs font-medium">{t(`status.${r.status}`)}</span>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">{t("amount")}</dt>
          <dd className="font-semibold">{r.amount_paisa === null ? t("amountAtClose") : money(r.amount_paisa)}</dd>
        </div>
        <div>
          <dt className="text-muted">{t("repaid")}</dt>
          <dd className="font-semibold">{money(r.repaid_paisa)}</dd>
        </div>
      </dl>

      {r.shares.length > 0 ? (
        <div className="mt-2">
          <p className="text-sm font-medium">{t("shares")}</p>
          <ul className="text-sm">
            {r.shares.map((s) => (
              <li key={s.member_id} className="flex flex-wrap items-center gap-x-2">
                <span>{nameOf(s.member_id)}</span>
                <span>{s.amount_paisa !== null ? money(s.amount_paisa) : s.manual_amount_paisa !== null ? money(s.manual_amount_paisa) : "—"}</span>
                {isArchived(s.member_id) ? (
                  <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs">{t("payableToExMember")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? <p role="status" className="mt-2 text-sm">{notice}</p> : null}

      {isManager && r.status === "open" ? (
        repaying ? (
          <RepayForm
            messId={messId}
            recoverableId={r.id}
            debtor={debtor}
            onDone={() => { setRepaying(false); setNotice(t("repaymentSaved")); }}
            onCancel={() => setRepaying(false)}
          />
        ) : (
          <div className="mt-2">
            <Button size="sm" variant="secondary" onPress={() => { setNotice(null); setRepaying(true); }} aria-label={t("recordFor", { name: debtor })}>
              {t("record")}
            </Button>
          </div>
        )
      ) : null}
    </li>
  );
}

function RepayForm({
  messId,
  recoverableId,
  debtor,
  onDone,
  onCancel,
}: {
  messId: number;
  recoverableId: number;
  debtor: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("months.recoverables");
  const errorText = useErrorText();
  const repay = useRepay(messId, recoverableId);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayInDhaka());
  const [amountError, setAmountError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBanner(null);
    setAmountError(null);
    setDateError(null);
    const parsed = parseTakaToPaisa(amount);
    if (!parsed.ok) return setAmountError(parsed.reason === "empty" ? t("form.amountRequired") : t("form.amountInvalid"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return setDateError(t("form.dateRequired"));
    try {
      await repay.mutateAsync({ amount_paisa: parsed.paisa, paid_on: paidOn });
      onDone();
    } catch (error) {
      if (isApiError(error) && error.isValidation) {
        const a = error.fieldError("amount_paisa");
        const d = error.fieldError("paid_on");
        if (a) setAmountError(a);
        if (d) setDateError(d);
        if (!a && !d) setBanner(errorText(error));
      } else setBanner(errorText(error));
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label={t("form.title", { name: debtor })} className="mt-3 flex flex-col gap-3 rounded-xl bg-default-100 p-3">
      <h4 className="font-medium">{t("form.title", { name: debtor })}</h4>
      {banner ? <Banner>{banner}</Banner> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`rp-amount-${recoverableId}`} className="text-sm font-medium">{t("form.amount")}</label>
          <input
            id={`rp-amount-${recoverableId}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={fieldClass}
            value={amount}
            aria-invalid={Boolean(amountError)}
            onChange={(e) => setAmount(e.target.value)}
          />
          {amountError ? <p role="alert" className="text-sm text-danger">{amountError}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`rp-date-${recoverableId}`} className="text-sm font-medium">{t("form.date")}</label>
          <input
            id={`rp-date-${recoverableId}`}
            type="date"
            className={fieldClass}
            value={paidOn}
            aria-invalid={Boolean(dateError)}
            onChange={(e) => setPaidOn(e.target.value)}
          />
          {dateError ? <p role="alert" className="text-sm text-danger">{dateError}</p> : null}
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onPress={onCancel}>{t("form.cancel")}</Button>
        <Button type="submit" variant="primary" isDisabled={repay.isPending}>{repay.isPending ? t("form.saving") : t("form.save")}</Button>
      </div>
    </form>
  );
}
