export const locales = ["en", "bn"] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = "en";
/** Cookie the language switcher writes (kept in sync with users.locale by the API client). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
