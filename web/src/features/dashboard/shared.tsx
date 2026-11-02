"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import type { HistoryRow, MonthInfo, RoundingMode } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { formatBalance, formatMonthLabel, formatNumber } from "@/lib/format";
import { fieldClass } from "@/components/ui/field";

export function is404(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}

/** Balance text: "Due ৳400" (danger) / "Credit ৳700" (success) / "Settled". Server sign is trusted as-is. */
export function Balance({ paisa, mode, testId }: { paisa: number; mode: RoundingMode; testId?: string }) {
  const locale = useLocale() as AppLocale;
  const tc = useTranslations("common");
  const tone = paisa < 0 ? "text-danger" : paisa > 0 ? "text-success" : "text-muted";
  return (
    <span className={`font-semibold ${tone}`} data-testid={testId}>
      {formatBalance(paisa, locale, mode, tc)}
    </span>
  );
}

export function OverdueBadge({ days, kind }: { days: number; kind: "fixed" | "deposit" }) {
  const t = useTranslations("dashboard");
  const locale = useLocale() as AppLocale;
  if (days <= 0) return null;
  return (
    <span
      className="inline-flex items-center rounded-full bg-danger/15 px-2 py-0.5 text-xs font-medium text-danger"
      data-testid={`overdue-${kind}`}
    >
      {t(`overdue.${kind}`, { days: formatNumber(days, locale) })}
    </span>
  );
}

/**
 * Month select. `selected` is the month actually shown; choosing an option reports its id.
 * Options come from /history (every month, newest first); falls back to the shown month alone.
 */
export function MonthPicker({
  id = "month-picker", selected, current, history, onChange,
}: {
  id?: string;
  selected: number | null;
  current: MonthInfo | undefined;
  history: HistoryRow[] | undefined;
  onChange: (monthId: number) => void;
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale() as AppLocale;
  const options: { id: number; starts_on: string; status: string }[] =
    history && history.length > 0
      ? history.map((h) => ({ id: h.month_id, starts_on: h.starts_on, status: h.status }))
      : current
        ? [{ id: current.id, starts_on: current.starts_on, status: current.status }]
        : [];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">{t("month.label")}</label>
      <select
        id={id}
        className={fieldClass}
        value={selected ?? ""}
        disabled={options.length === 0}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {formatMonthLabel(o.starts_on, locale)} ({o.status === "open" ? t("month.open") : t("month.closed")})
          </option>
        ))}
      </select>
    </div>
  );
}
