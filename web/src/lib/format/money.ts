import type { AppLocale } from "@/i18n/config";
import type { RoundingMode } from "@/lib/api/contract";
import { groupSouthAsian, localizeDigits } from "./digits";

export const TAKA_SYMBOL = "৳";

/**
 * Formats integer paisa as taka. Integer math only (no floats).
 * - two_decimals: always shows paisa (৳1,234.50).
 * - whole_taka: whole taka, half rounded away from zero (display safety net; the server
 *   normally already sends multiples of 100 for whole-taka messes).
 * - round_up: whole taka, any remainder rounded up in magnitude.
 * Negative values render as "-৳400".
 */
export function formatMoney(paisa: number, locale: AppLocale, mode: RoundingMode = "two_decimals"): string {
  const total = Math.trunc(paisa);
  const negative = total < 0;
  const abs = Math.abs(total);
  let taka = Math.floor(abs / 100);
  const rem = abs % 100;

  let body: string;
  if (mode === "two_decimals") {
    body = `${groupSouthAsian(String(taka))}.${String(rem).padStart(2, "0")}`;
  } else {
    if (mode === "round_up" ? rem > 0 : rem >= 50) taka += 1;
    body = groupSouthAsian(String(taka));
  }

  const isZero = body.replace(/[.,0]/g, "") === "";
  const sign = negative && !isZero ? "-" : "";
  return localizeDigits(`${sign}${TAKA_SYMBOL}${body}`, locale);
}

export type BalanceTranslator = (
  key: "balance.due" | "balance.credit" | "balance.settled",
  values: { amount: string },
) => string;

/**
 * Renders a server balance (positive = credit, negative = due) using common.json strings:
 * "Due ৳400" / "Credit ৳700" / "Settled". Pass `useTranslations("common")` as `t`.
 */
export function formatBalance(
  balancePaisa: number,
  locale: AppLocale,
  mode: RoundingMode,
  t: BalanceTranslator,
): string {
  const value = Math.trunc(balancePaisa);
  const amount = formatMoney(Math.abs(value), locale, mode);
  if (value < 0) return t("balance.due", { amount });
  if (value > 0) return t("balance.credit", { amount });
  return t("balance.settled", { amount });
}
