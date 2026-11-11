"use client";

import { useLocale } from "next-intl";
import { useChangeLocale } from "@/i18n/client";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import type { User } from "@/lib/api/contract";
import { apiClient } from "@/lib/api-client/client";
import { writeLocaleCookie } from "@/lib/i18n/language-switcher";

/**
 * After a login: on a device with no language choice yet, adopt the account's saved language.
 * If the device already has a choice, keep it and save it on the account.
 */
export function useSyncLocaleAfterLogin() {
  const current = useLocale();
  const changeLocale = useChangeLocale();

  return (user: Pick<User, "locale">) => {
    if (!isLocale(user.locale) || user.locale === current) return;
    const hasChoice = document.cookie.split("; ").some((c) => c.startsWith(`${LOCALE_COOKIE}=`));
    if (!hasChoice) {
      writeLocaleCookie(user.locale);
      void changeLocale(user.locale);
    } else {
      apiClient.patch("/api/auth/me", { locale: current }, { skipUnauthorized: true }).catch(() => {});
    }
  };
}
