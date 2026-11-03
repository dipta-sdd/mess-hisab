"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { ExpenseInput } from "@/lib/api/contract";
import { formatDate } from "@/lib/format";
import { listQueued, removeQueued, subscribeQueue, updateQueued, type QueuedExpense } from "@/lib/offline/queue";
import { syncQueued } from "@/lib/offline/sync";

/** Re-reads the offline queue whenever it changes. */
export function useQueuedExpenses(messId: number, memberId: number | undefined): QueuedExpense[] {
  const [items, setItems] = useState<QueuedExpense[]>([]);
  const refresh = useCallback(() => {
    if (memberId === undefined) return;
    listQueued(messId, memberId).then(setItems, () => setItems([]));
  }, [messId, memberId]);
  useEffect(() => {
    refresh();
    return subscribeQueue(refresh);
  }, [refresh]);
  return items;
}

/** Expenses saved on this phone that have not reached the server yet. */
export function QueuedExpenses({
  messId,
  memberId,
  categoryName,
  money,
  onEdit,
}: {
  messId: number;
  memberId: number;
  categoryName: (id: number) => string;
  money: (paisa: number) => string;
  /** Hand the item back to the add form; the queue entry is dropped. */
  onEdit: (input: ExpenseInput) => void;
}) {
  const t = useTranslations("expenses.offline");
  const locale = useLocale() as AppLocale;
  const client = useQueryClient();
  const items = useQueuedExpenses(messId, memberId);
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="queued-title" className="overflow-hidden rounded-2xl border border-warning bg-surface" data-testid="queued-expenses">
      <div className="border-b border-border px-4 py-3">
        <h2 id="queued-title" className="font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("hint")}</p>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3" data-testid={`queued-${item.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words font-medium">{categoryName(item.payload.category_id)}</p>
                <p className="text-sm text-muted">
                  {formatDate(item.payload.spent_on, locale)} ·{" "}
                  <span className={item.status === "needs_attention" ? "font-medium text-danger" : "font-medium text-warning"}>
                    {item.status === "needs_attention" ? t("needsAttention") : t("waiting")}
                  </span>
                </p>
                {item.payload.note ? <p className="mt-1 break-words text-sm">{item.payload.note}</p> : null}
                {item.status === "needs_attention" && item.reason ? <p role="alert" className="mt-1 break-words text-sm text-danger">{item.reason}</p> : null}
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums">{money(item.payload.amount_paisa)}</p>
            </div>
            {item.status === "needs_attention" ? (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" className="min-h-9" onPress={async () => { await removeQueued(item.id); onEdit(item.payload); }}>{t("edit")}</Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-9"
                  onPress={async () => {
                    await updateQueued(item.id, { status: "queued", reason: null });
                    void syncQueued(client, messId, memberId);
                  }}
                >
                  {t("retry")}
                </Button>
                <Button size="sm" variant="ghost" className="min-h-9 text-danger" onPress={() => removeQueued(item.id)}>{t("delete")}</Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
