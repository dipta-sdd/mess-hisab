"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { isLocale, LOCALE_COOKIE, locales, type AppLocale } from "@/i18n/config";
import { apiClient } from "@/lib/api-client/client";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Writes the NEXT_LOCALE cookie (path /, 1 year). */
export function writeLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}

/**
 * Returns `setLocale(next)`: sets the cookie, refreshes server components, and (fire-and-forget)
 * saves the choice on the user profile. A guest's 401 / any failure is ignored.
 */
export function useSetLocale() {
  const router = useRouter();

  return function setLocale(next: AppLocale) {
    if (!isLocale(next)) return;
    writeLocaleCookie(next);
    router.refresh();
    apiClient.patch("/api/auth/me", { locale: next }, { skipUnauthorized: true }).catch(() => {});
  };
}

const LABELS: Record<AppLocale, string> = { en: "English", bn: "বাংলা" };

/** Compact EN | বাংলা toggle. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const current = useLocale();
  const t = useTranslations("common");
  const setLocale = useSetLocale();

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
