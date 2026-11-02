export type ParsedMeals = { ok: true; centi: number } | { ok: false; reason: "invalid" | "step" | "tooLarge" };

/** The API accepts typed meals in half-meal steps (multiples of 50 centi). The server stays the authority. */
export const STEP_CENTI = 50;
export const MAX_DAY_CENTI = 1000;
export const MAX_MONTH_CENTI = 31000;

function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

/**
 * Parses a meal count typed by a person ("2", "2.5", "০.৫") into integer centi-meals.
 * String math only. An empty box means 0. Rejects anything that is not a multiple of 0.5.
 */
export function parseMealsToCenti(input: string, max: number = MAX_DAY_CENTI): ParsedMeals {
  const raw = toLatinDigits(input).trim();
  if (raw === "") return { ok: true, centi: 0 };

  const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return { ok: false, reason: "invalid" };

  const centi = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (centi % STEP_CENTI !== 0) return { ok: false, reason: "step" };
  if (centi > max) return { ok: false, reason: "tooLarge" };
  return { ok: true, centi };
}

/** Integer centi-meals to an editable string (250 -> "2.5", 200 -> "2", 0 -> "0"). */
export function centiToInput(centi: number): string {
  const whole = Math.floor(centi / 100);
  const rem = centi % 100;
  if (rem === 0) return String(whole);
  return `${whole}.${String(rem).padStart(2, "0").replace(/0$/, "")}`;
}
