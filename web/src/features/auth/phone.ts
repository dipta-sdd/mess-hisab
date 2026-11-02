import { toLatinDigits } from "@/lib/format";

/** Typed phone -> ASCII digits with an optional leading "+", no spaces or dashes. */
export function cleanPhone(input: string): string {
  return toLatinDigits(input).replace(/[\s\-().]/g, "");
}

/** Bangladesh mobile: 01XXXXXXXXX, +8801XXXXXXXXX or 8801XXXXXXXXX (operator digit 3-9). */
export function isBdMobile(input: string): boolean {
  return /^(?:\+?880|0)1[3-9]\d{8}$/.test(cleanPhone(input));
}

/** What we send to the API; the server normalises it. */
export function phoneForApi(input: string): string {
  return cleanPhone(input);
}

/** Zod message for an invalid phone; translated by `useAuthFieldMessage`. */
export const PHONE_INVALID = "a:phone";
