import type { AppLocale } from "@/i18n/config";

export const BUSINESS_TIME_ZONE = "Asia/Dhaka";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formats a `YYYY-MM-DD` date (calendar date, no timezone shift) or an ISO timestamp
 * (shown in Asia/Dhaka) as "2 Nov 2026" / "২ নভেম্বর ২০২৬".
 */
export function formatDate(iso: string, locale: AppLocale): string {
  const intlLocale = locale === "bn" ? "bn-BD-u-nu-beng" : "en-GB";
  const only = DATE_ONLY.exec(iso);
  let date: Date;
  let timeZone: string;
  if (only) {
    date = new Date(Date.UTC(Number(only[1]), Number(only[2]) - 1, Number(only[3])));
    timeZone = "UTC";
  } else {
    date = new Date(iso);
    timeZone = BUSINESS_TIME_ZONE;
  }
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale, { day: "numeric", month: locale === "bn" ? "long" : "short", year: "numeric", timeZone }).format(date);
}

/** Today's calendar date in the business time zone (Asia/Dhaka), as YYYY-MM-DD. */
export function todayInDhaka(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "November 2026" / "নভেম্বর ২০২৬" for a YYYY-MM-DD month start (no timezone shift). */
export function formatMonthLabel(startsOn: string, locale: AppLocale): string {
  const [y, m, d] = startsOn.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return startsOn;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-beng" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
