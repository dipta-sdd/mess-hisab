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
