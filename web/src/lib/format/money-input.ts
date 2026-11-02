/**
 * Typed-in amounts: taka -> paisa and meals -> centi-meals, and back to an editable string.
 * String math on purpose: no float ever touches an amount. This is the ONE implementation; do not copy it.
 */

export type ParsedTaka = { ok: true; paisa: number } | { ok: false; reason: "empty" | "invalid" | "zero" | "tooLarge" };
export type ParsedMeals = { ok: true; centi: number } | { ok: false; reason: "empty" | "invalid" | "tooLarge" };

/** Largest amount the API accepts, in paisa. */
export const MAX_PAISA = 9_000_000_000_000;

/** Largest minimum-meals value, in centi-meals (10,000 meals). */
export const MAX_MEALS_CENTI = 1_000_000;

/** Bangla digits (০-৯) to ASCII so people can type amounts in either script. */
export function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

/** Digits with optional single thousands commas (1,000 / 1,00,000), optional 1-2 decimals. */
const AMOUNT = /^(\d(?:,?\d)*)(?:\.(\d{1,2}))?$/;

export interface ParseTakaOptions {
  /** Accept 0 (a bill or override of 0 is valid). Default false: zero is reported as "zero". */
  allowZero?: boolean;
  /** Largest accepted paisa. Default MAX_PAISA. */
  max?: number;
}

/**
 * Parses a taka amount typed by a person ("521.5", "1,000", "০.০৫") into integer paisa.
 * At most two decimals; no sign, no exponent, no letters; at most 13 whole digits.
 */
export function parseTakaToPaisa(input: string, options: ParseTakaOptions = {}): ParsedTaka {
  const { allowZero = false, max = MAX_PAISA } = options;
  const raw = toLatinDigits(input).trim();
  if (raw === "") return { ok: false, reason: "empty" };

  const match = AMOUNT.exec(raw);
  if (!match) return { ok: false, reason: "invalid" };

  const whole = match[1].replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (whole.length > 13) return { ok: false, reason: "tooLarge" };
  const paisa = Number(whole) * 100 + Number((match[2] ?? "").padEnd(2, "0"));

  if (paisa === 0 && !allowZero) return { ok: false, reason: "zero" };
  if (paisa > max || !Number.isSafeInteger(paisa)) return { ok: false, reason: "tooLarge" };
  return { ok: true, paisa };
}

export interface ParseMealsOptions {
  /** Largest accepted centi-meals. Default MAX_MEALS_CENTI. */
  max?: number;
  /** Most whole digits accepted before "invalid". Default 6. */
  maxWholeDigits?: number;
}

/** Meals box ("20", "12.5") to integer centi-meals. Up to two decimals; max 10,000 meals by default. */
export function parseMealsToCenti(input: string, options: ParseMealsOptions = {}): ParsedMeals {
  const { max = MAX_MEALS_CENTI, maxWholeDigits = 6 } = options;
  const raw = toLatinDigits(input).trim();
  if (raw === "") return { ok: false, reason: "empty" };
  const match = new RegExp(`^(\\d{1,${maxWholeDigits}})(?:\\.(\\d{1,2}))?$`).exec(raw);
  if (!match) return { ok: false, reason: "invalid" };
  const centi = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return centi > max || !Number.isSafeInteger(centi) ? { ok: false, reason: "tooLarge" } : { ok: true, centi };
}

/** Integer scaled by 100 to an editable string: 52150 -> "521.5", 5 -> "0.05", 50000 -> "500". */
export function paisaToTakaInput(paisa: number): string {
  const taka = Math.floor(paisa / 100);
  const rem = paisa % 100;
  if (rem === 0) return String(taka);
  return `${taka}.${String(rem).padStart(2, "0").replace(/0$/, "")}`;
}

/** Centi-meals to an editable string; same shape as {@link paisaToTakaInput}. */
export const centiToInput = paisaToTakaInput;
