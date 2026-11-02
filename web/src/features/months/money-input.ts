export type ParsedTaka = { ok: true; paisa: number } | { ok: false; reason: "empty" | "invalid" | "zero" | "tooLarge" };

/** Largest amount the API accepts, in paisa. */
export const MAX_PAISA = 9_000_000_000_000;

/** Bangla digits to ASCII so people can type amounts in either script. */
function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

/**
 * Parses a typed taka amount ("521.5", "1,000", "০.০৫") into integer paisa. String math only.
 * At most two decimals; no sign, no exponent. Zero is refused unless `allowZero`.
 */
export function parseTakaToPaisa(input: string, options: { allowZero?: boolean } = {}): ParsedTaka {
  const raw = toLatinDigits(input).trim();
  if (raw === "") return { ok: false, reason: "empty" };
  const match = /^(\d[\d,]*)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return { ok: false, reason: "invalid" };

  const whole = match[1].replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (whole.length > 13) return { ok: false, reason: "tooLarge" };
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const paisa = Number(whole) * 100 + Number(fraction);

  if (paisa === 0 && !options.allowZero) return { ok: false, reason: "zero" };
  if (paisa > MAX_PAISA) return { ok: false, reason: "tooLarge" };
  return { ok: true, paisa };
}
