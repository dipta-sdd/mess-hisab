"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import type { CreateResult } from "../api";

/** Result of a save, with the notes the member should read (short cash, pending approval, late entry). */
export type SavedResult = CreateResult & { edited: boolean };

/** Whether a save has anything worth showing besides "it worked". */
export function hasSavedNotes({ expense, warnings }: CreateResult): boolean {
  return expense.is_late || expense.status === "pending" || warnings.includes("short_cash_converted");
}

export function SavedPanel({
  saved,
  categoryName,
  money,
  onDismiss,
  dismissLabel,
}: {
  saved: SavedResult;
  categoryName: (id: number) => string;
  money: (paisa: number) => string;
  onDismiss: () => void;
  /** Defaults to "Dismiss". */
  dismissLabel?: string;
}) {
  const t = useTranslations("expenses");
  const { expense, warnings } = saved;
  const known = warnings.filter((w) => w === "short_cash_converted");
  return (
    <section role="status" aria-label={t("saved.title")} className="flex flex-col gap-2 rounded-2xl border border-success bg-success/10 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">
          {saved.edited ? t("saved.updated") : t("saved.created")}: {categoryName(expense.category_id)} · {money(expense.amount_paisa)}
        </p>
        <Button size="sm" variant="ghost" onPress={onDismiss}>
          {dismissLabel ?? t("actions.dismiss")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {expense.is_late ? <span className="rounded-full bg-default px-2 py-0.5 text-xs font-medium">{t("badges.late")}</span> : null}
      </div>
      {expense.is_late ? <p className="text-sm">{t("saved.lateHint")}</p> : null}
      {expense.status === "pending" ? <p className="text-sm">{t("saved.pendingHint")}</p> : null}
      {known.map((w) => (
        <p key={w} role="alert" className="rounded-lg border border-warning bg-warning/15 p-3 text-sm font-medium">
          {t(`warnings.${w}`)}
        </p>
      ))}
    </section>
  );
}
