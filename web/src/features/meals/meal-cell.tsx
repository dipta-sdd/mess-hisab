"use client";

import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import type { MealEntry, MealTracking } from "@/lib/api/contract";
import { formatMeals, formatNumber } from "@/lib/format";
import { centiToInput } from "./centi";
import { draftProblems, ticksOf, type CellDraft, type Ticks } from "./draft";

const inputClass =
  "w-full min-h-11 rounded-lg border border-border bg-background px-2 py-1 text-center text-base text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-accent aria-[invalid=true]:border-danger";

const TICKS = ["breakfast", "lunch", "dinner"] as const;

/** One member's meals for one day (or for the whole month in `month_total` style). */
export function MealCell({
  style,
  label,
  entry,
  draft,
  editable,
  compact = false,
  onChange,
}: {
  style: Exclude<MealTracking, "off">;
  /** Accessible context, e.g. "Rahim, 2 Nov". */
  label: string;
  entry?: MealEntry;
  draft?: CellDraft;
  editable: boolean;
  compact?: boolean;
  onChange: (patch: CellDraft) => void;
}) {
  const t = useTranslations("meals");
  const locale = useLocale() as AppLocale;
  const problems = draftProblems(style, draft);

  const mealsValue = draft?.meals ?? (entry ? centiToInput(entry.meals_centi) : "");
  const guestValue = draft?.guest ?? (entry && entry.guest_meals_centi > 0 ? centiToInput(entry.guest_meals_centi) : "");
  const ticks = ticksOf(entry, draft);

  if (!editable) {
    const own = entry?.meals_centi ?? 0;
    const guests = entry?.guest_meals_centi ?? 0;
    return (
      <div className="text-center text-sm" aria-label={label}>
        {style === "bld_ticks" ? (
          <span className="tracking-widest">
            {TICKS.map((k) => (ticks[k] ? t(`ticks.short.${k}`) : "·")).join(" ")}
          </span>
        ) : null}
        {style === "bld_ticks" && own > 0 ? <span className="block text-sm text-muted">{formatMeals(own, locale)}</span> : null}
        {style !== "bld_ticks" ? <span>{entry ? formatMeals(own, locale) : "–"}</span> : null}
        {guests > 0 ? <span className="block text-sm text-muted">{t("cell.guestsShort", { count: formatMeals(guests, locale) })}</span> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {style === "bld_ticks" ? (
        <div className="flex items-center justify-center gap-2">
          {TICKS.map((k) => (
            <label key={k} className="flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 text-xs">
              <input
                type="checkbox"
                className="size-5 accent-[var(--accent)]"
                checked={ticks[k]}
                aria-label={`${t(`ticks.${k}`)}: ${label}`}
                onChange={(e) => onChange({ ticks: { ...ticks, [k]: e.target.checked } satisfies Ticks })}
              />
              <span aria-hidden>{t(`ticks.short.${k}`)}</span>
            </label>
          ))}
        </div>
      ) : (
        <input
          className={inputClass}
          inputMode="decimal"
          autoComplete="off"
          placeholder={formatNumber(0, locale)}
          value={mealsValue}
          aria-label={`${t("cell.meals")}: ${label}`}
          aria-invalid={problems.meals || undefined}
          onChange={(e) => onChange({ meals: e.target.value })}
        />
      )}
      <input
        className={`${inputClass} ${compact ? "text-xs" : "text-sm"}`}
        inputMode="decimal"
        autoComplete="off"
        placeholder={t("cell.guestPlaceholder")}
        value={guestValue}
        aria-label={`${t("cell.guests")}: ${label}`}
        aria-invalid={problems.guest || undefined}
        onChange={(e) => onChange({ guest: e.target.value })}
      />
    </div>
  );
}
