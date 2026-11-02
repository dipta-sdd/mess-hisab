export type ParsedTaka = { ok: true; paisa: number } | { ok: false; reason: "empty" | "invalid" | "zero" | "tooLarge" };

/** Largest amount the API accepts (PaymentRequest max), in paisa. */
export const MAX_PAISA = 9_000_000_000_000;

/** Bangla digits (০-৯) to ASCII so people can type amounts in either script. */
function toLatinDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}

/**
 * Parses a taka amount typed by a person ("521.5", "1,000", "০.০৫") into integer paisa.
 * String math only: no float parsing. At most two decimals; no sign, no exponent, no letters.
 */
export function parseTakaToPaisa(input: string): ParsedTaka {
  const raw = toLatinDigits(input).trim();
  if (raw === "") return { ok: false, reason: "empty" };

  const match = /^(\d[\d,]*)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return { ok: false, reason: "invalid" };

  const whole = match[1].replace(/,/g, "").replace(/^0+(?=\d)/, "");
  if (whole.length > 13) return { ok: false, reason: "tooLarge" };
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const paisa = Number(whole) * 100 + Number(fraction);

  if (paisa === 0) return { ok: false, reason: "zero" };
  if (paisa > MAX_PAISA) return { ok: false, reason: "tooLarge" };
  return { ok: true, paisa };
}

/** Integer paisa to an editable taka string (52150 -> "521.5", 5 -> "0.05", 50000 -> "500"). */
export function paisaToTakaInput(paisa: number): string {
  const taka = Math.floor(paisa / 100);
  const rem = paisa % 100;
  if (rem === 0) return String(taka);
  return `${taka}.${String(rem).padStart(2, "0").replace(/0$/, "")}`;
}
