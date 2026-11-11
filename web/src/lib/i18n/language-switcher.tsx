"use client";

import { useLocale, useTranslations } from "next-intl";
import { useChangeLocale } from "@/i18n/client";
import { isLocale, LOCALE_COOKIE, locales, type AppLocale } from "@/i18n/config";
import { apiClient } from "@/lib/api-client/client";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Writes the NEXT_LOCALE cookie (path /, 1 year). */
export function writeLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/**
 * Returns `setLocale(next)`: sets the cookie, reloads the messages in place, and (fire-and-forget)
 * saves the choice on the user profile. A guest's 401 / any failure is ignored.
 */
export function useSetLocale() {
  const changeLocale = useChangeLocale();

  return function setLocale(next: AppLocale) {
    if (!isLocale(next)) return;
    writeLocaleCookie(next);
    void changeLocale(next);
    apiClient.patch("/api/auth/me", { locale: next }, { skipUnauthorized: true }).catch(() => {});
  };
}

const LABELS: Record<AppLocale, string> = { en: "English", bn: "বাংলা" };

const SHORT: Record<AppLocale, string> = { en: "EN", bn: "বাং" };

/**
 * EN | বাংলা toggle. `compact` is one small button that switches to the other language
 * (it shows that language's short name), for tight spots like the sidebar header.
 */
export function LanguageSwitcher({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const current = useLocale();
  const t = useTranslations("common");
  const setLocale = useSetLocale();

  if (compact) {
    const other = locales.find((locale) => locale !== current) ?? locales[0];
    return (
      <button
        type="button"
        lang={other}
        onClick={() => setLocale(other)}
        aria-label={`${t("language.label")}: ${LABELS[other]}`}
        title={LABELS[other]}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border text-sm font-medium hover:bg-default ${className}`}
      >
        {SHORT[other]}
      </button>
    );
  }

  return (
    <div role="group" aria-label={t("language.label")} className={`inline-flex overflow-hidden rounded-lg border border-border text-sm ${className}`}>
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={current === locale}
          onClick={() => current !== locale && setLocale(locale)}
          className={`min-h-11 px-3 py-1 font-medium transition-colors ${
            current === locale ? "bg-accent text-accent-foreground" : "hover:bg-default"
          }`}
        >
          {LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
