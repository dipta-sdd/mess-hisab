import type { AppLocale } from "@/i18n/config";
import { groupSouthAsian, localizeDigits } from "./digits";

/**
 * Formats a number with South-Asian grouping (1,00,000) and locale digits.
 * Decimals are kept as given (no rounding). Accepts numeric strings too.
 */
export function formatNumber(value: number | string, locale: AppLocale): string {
  const raw = typeof value === "number" ? numberToPlain(value) : value.trim();
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [int = "0", frac] = unsigned.split(".");
  const text = `${negative ? "-" : ""}${groupSouthAsian(int || "0")}${frac ? `.${frac}` : ""}`;
  return localizeDigits(text, locale);
}

/** Plain decimal string for a JS number (avoids exponent notation for normal sizes). */
function numberToPlain(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const s = String(n);
  return s.includes("e") ? n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 }) : s;
}

/** Centi-meals (integer) to a meal count: 250 -> "2.5", 200 -> "2", 5 -> "0.05". */
export function formatMeals(centi: number, locale: AppLocale): string {
  const n = Math.trunc(centi);
  const negative = n < 0;
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const fracText = frac === 0 ? "" : `.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
  const sign = negative && abs !== 0 ? "-" : "";
  return localizeDigits(`${sign}${groupSouthAsian(String(whole))}${fracText}`, locale);
}
