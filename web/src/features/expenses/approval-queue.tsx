"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { Expense } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { useApproveExpense, useRejectExpense } from "./api";

import { ExpenseRow } from "./expense-row";
import { errorKey } from "./rules";
import { fieldClass } from "@/components/ui/field";

export function ApprovalQueue({
  messId,
  expenses,
  categoryName,
  memberName,
  payerLabel,
  locale,
  money,
}: {
  messId: number;
  expenses: Expense[];
  categoryName: (id: number) => string;
  memberName: (id: number | null) => string;
  payerLabel: (e: Expense) => string;
  locale: AppLocale;
  money: (paisa: number) => string;
}) {
  const t = useTranslations("expenses");
  const [notice, setNotice] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  return (
    <section aria-labelledby="queue-title" className="flex flex-col gap-2 rounded-2xl border border-warning bg-warning/5 p-4">
      <h2 id="queue-title" className="text-lg font-semibold">
        {t("queue.title")} ({expenses.length})
      </h2>
      {notice ? (
        <div role={notice.tone === "error" ? "alert" : "status"} className={`rounded-lg border p-3 text-sm ${notice.tone === "error" ? "border-danger bg-danger/10 text-danger" : "border-warning bg-warning/10"}`}>
          {notice.text}
        </div>
      ) : null}
      {expenses.length === 0 ? (
        <p className="text-muted">{t("queue.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {expenses.map((e) => (
            <QueueItem
              key={e.id}
              messId={messId}
              expense={e}
              categoryName={categoryName(e.category_id)}
              creatorName={memberName(e.created_by_member_id)}
              payerLabel={payerLabel(e)}
              locale={locale}
              money={money}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueItem({
  messId,
  expense,
  categoryName,
  creatorName,
  payerLabel,
  locale,
  money,
  onNotice,
}: {
  messId: number;
  expense: Expense;
  categoryName: string;
  creatorName: string;
  payerLabel: string;
  locale: AppLocale;
  money: (paisa: number) => string;
  onNotice: (n: { tone: "error" | "info"; text: string } | null) => void;
}) {
  const t = useTranslations("expenses");
  const approve = useApproveExpense(messId);
  const reject = useRejectExpense(messId);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const busy = approve.isPending || reject.isPending;

  function fail(error: unknown) {
    if (!isApiError(error)) return onNotice({ tone: "error", text: t("errors.generic") });
    const key = errorKey(error);
    onNotice({ tone: "error", text: key === "generic" && error.message ? error.message : t(`errors.${key}`) });
  }

  async function doApprove() {
    onNotice(null);
    try {
      const approved = await approve.mutateAsync(expense.id);
      if (approved.short_cash_converted) onNotice({ tone: "info", text: t("warnings.short_cash_converted") });
    } catch (error) {
      fail(error);
    }
  }

  async function doReject() {
    if (reason.trim() === "") return setReasonError(true);
    onNotice(null);
    try {
      await reject.mutateAsync({ id: expense.id, reason: reason.trim() });
    } catch (error) {
      fail(error);
    }
  }

  return (
    <ExpenseRow expense={expense} categoryName={categoryName} payerLabel={payerLabel} creatorName={creatorName} locale={locale} money={money}>
      {rejecting ? (
        <div className="mt-2 flex flex-col gap-2">
          <label htmlFor={`reason-${expense.id}`} className="text-sm font-medium">
            {t("queue.reasonLabel")}
          </label>
          <textarea
            id={`reason-${expense.id}`}
            rows={2}
            maxLength={500}
            className={fieldClass}
            value={reason}
            aria-invalid={reasonError}
            aria-describedby={reasonError ? `reason-${expense.id}-error` : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(false);
            }}
          />
          {reasonError ? (
            <p id={`reason-${expense.id}-error`} role="alert" className="text-sm text-danger">
              {t("queue.reasonRequired")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" onPress={doReject} isDisabled={busy}>
              {t("queue.confirmReject")}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setRejecting(false)}>
              {t("actions.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="primary" onPress={doApprove} isDisabled={busy} aria-label={`${t("queue.approve")}: ${categoryName} ${money(expense.amount_paisa)}`}>
            {t("queue.approve")}
          </Button>
          <Button size="sm" variant="danger-soft" onPress={() => setRejecting(true)} isDisabled={busy} aria-label={`${t("queue.reject")}: ${categoryName} ${money(expense.amount_paisa)}`}>
            {t("queue.reject")}
          </Button>
        </div>
      )}
    </ExpenseRow>
  );
}
