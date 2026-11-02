import type { AppLocale } from "@/i18n/config";

/** Today's calendar date in the business time zone (Asia/Dhaka), as YYYY-MM-DD. */
export function todayInDhaka(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "November 2026" / "নভেম্বর ২০২৬" for a YYYY-MM-DD month start (no timezone shift). */
export function formatMonthLabel(startsOn: string, locale: AppLocale): string {
  const [y, m, d] = startsOn.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return startsOn;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-beng" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
