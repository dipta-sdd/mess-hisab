import { paisaToTakaInput, parseMealsToCenti, parseTakaToPaisa } from "@/lib/format/money-input";

/**
 * Null-returning wrappers over the shared parsers (@/lib/format/money-input) for the settings and
 * create-mess forms: zero is fine and there is no API-max cap here (the server validates those).
 */

/** "521.5" -> 52150, "0.05" -> 5, "1,000" -> 100000. Null when invalid. */
export function parseTakaOrNull(input: string): number | null {
  const r = parseTakaToPaisa(input, { allowZero: true, max: Number.MAX_SAFE_INTEGER });
  return r.ok ? r.paisa : null;
}

/** "2.5" -> 250, "0.05" -> 5. Null when invalid. */
export function parseMealsOrNull(input: string): number | null {
  const r = parseMealsToCenti(input, { max: Number.MAX_SAFE_INTEGER, maxWholeDigits: 13 });
  return r.ok ? r.centi : null;
}

/** Integer scaled by 100 back to an editable string without trailing zeros: 52150 -> "521.5", 5 -> "0.05". */
export function scaledToInput(value: number): string {
  const text = paisaToTakaInput(Math.trunc(Math.abs(value)));
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
