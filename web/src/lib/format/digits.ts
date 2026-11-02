import type { AppLocale } from "@/i18n/config";

const BANGLA_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const;

/** Replaces ASCII digits 0-9 with Bangla digits ০-৯; everything else is untouched. */
export function toBanglaDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => BANGLA_DIGITS[Number(d)]);
}

/** Applies the locale's digit set to an already-built ASCII string. */
export function localizeDigits(text: string, locale: AppLocale): string {
  return locale === "bn" ? toBanglaDigits(text) : text;
}

/** South-Asian grouping of a string of ASCII digits: 1234567 -> "12,34,567". */
export function groupSouthAsian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${head},${digits.slice(-3)}`;
}
