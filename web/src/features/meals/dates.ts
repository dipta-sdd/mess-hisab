import type { AppLocale } from "@/i18n/config";

/** "November 2026" / "নভেম্বর ২০২৬" for a YYYY-MM-DD month start (no timezone shift). */
export function formatMonthLabel(startsOn: string, locale: AppLocale): string {
  const [y, m, d] = startsOn.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return startsOn;
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-beng" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

/** Every YYYY-MM-DD from `start` to `end` inclusive (calendar math in UTC, no timezone shift). */
export function daysBetween(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const out: string[] = [];
  const last = Date.UTC(ey, em - 1, ed);
  for (let t = Date.UTC(sy, sm - 1, sd); t <= last && out.length < 62; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Short day label like "Mon 2" / "সোম ২". */
export function dayLabel(date: string, locale: AppLocale): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-beng" : "en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

/** True when `date` lies in the member's membership window (joined_on..left_on, both inclusive). */
export function memberInMess(joinedOn: string, leftOn: string | null, date: string): boolean {
  return joinedOn <= date && (leftOn === null || leftOn >= date);
}
