import type { AppLocale } from "@/i18n/config";
import type { RoundingMode } from "@/lib/api/contract";
import { groupSouthAsian, localizeDigits } from "./digits";

export const TAKA_SYMBOL = "৳";

/**
 * Formats integer paisa as taka. Integer math only (no floats).
 * - two_decimals: always shows paisa (৳1,234.50).
 * - whole_taka / round_up: whole taka when the amount is a whole taka (the server rounds
 *   charges); if paisa remain they are shown, never rounded away - display never changes money.
 * Negative values render as "-৳400".
 */
export function formatMoney(paisa: number, locale: AppLocale, mode: RoundingMode = "two_decimals"): string {
  const total = Math.trunc(paisa);
  const negative = total < 0;
  const abs = Math.abs(total);
  const taka = Math.floor(abs / 100);
  const rem = abs % 100;

  const body =
    mode === "two_decimals" || rem !== 0
      ? `${groupSouthAsian(String(taka))}.${String(rem).padStart(2, "0")}`
      : groupSouthAsian(String(taka));

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
