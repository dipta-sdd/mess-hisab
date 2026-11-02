/**
 * Decimal-string parsing for money (taka -> paisa) and meals (meals -> centi-meals).
 * String based on purpose: no floats ever touch an amount.
 */

const BANGLA_DIGITS = "০১২৩৪৫৬৭৮৯";

function asciiDigits(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(BANGLA_DIGITS.indexOf(d)));
}

/**
 * Parses a non-negative decimal with at most two decimals into an integer scaled by 100.
 * Accepts commas (1,000 / 1,00,000) and Bangla digits. Returns null for anything else
 * (empty, negative, letters, 1.234, 1.2.3, unsafe sizes).
 */
function parseScaled(input: string): number | null {
  const text = asciiDigits(input.trim());
  if (!/^\d[\d,]*(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "", frac = ""] = text.replace(/,/g, "").split(".");
  const wholeDigits = whole.replace(/^0+(?=\d)/, "");
  if (wholeDigits.length > 13) return null;
  const value = Number(wholeDigits) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(value) ? value : null;
}

/** "521.5" -> 52150, "0.05" -> 5, "1,000" -> 100000. Null when invalid. */
export function parseTakaToPaisa(input: string): number | null {
  return parseScaled(input);
}

/** "2.5" -> 250, "0.05" -> 5. Null when invalid. */
export function parseMealsToCenti(input: string): number | null {
  return parseScaled(input);
}

/** Integer scaled by 100 back to an editable string without trailing zeros: 52150 -> "521.5", 5 -> "0.05". */
export function scaledToInput(value: number): string {
  const n = Math.trunc(Math.abs(value));
  const whole = Math.floor(n / 100);
  const frac = n % 100;
  const text = frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
  return value < 0 ? `-${text}` : text;
}

export type BalanceDirection = "owes" | "credit";

/** Positive paisa = credit (mess owes them), negative = due (they owe). Never returns -0. */
export function signedPaisa(paisa: number, direction: BalanceDirection): number {
  if (paisa === 0) return 0;
  return direction === "credit" ? paisa : -paisa;
}

/** Splits a signed server amount back into form values. */
export function splitSigned(paisa: number): { amount: string; direction: BalanceDirection } {
  return { amount: scaledToInput(Math.abs(paisa)), direction: paisa > 0 ? "credit" : "owes" };
}

/** Today in the business time zone as YYYY-MM-DD. */
export function todayInDhaka(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}
