"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { defaultLocale, isLocale, LOCALE_COOKIE, type AppLocale } from "./config";

/** One file per namespace in messages/<locale>/; keep in sync with the folder (messages-parity.test checks it). */
export const namespaces = [
  "app", "audit", "auth", "common", "dashboard", "expenses", "export", "fixed", "meals",
  "members", "mess", "months", "payments", "reports", "settings", "settlement", "statements",
] as const;

async function loadMessages(locale: AppLocale): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    namespaces.map(async (ns) => [ns, ((await import(`../../messages/${locale}/${ns}.json`)) as { default: unknown }).default] as const),
  );
  return Object.fromEntries(entries);
}

function readLocaleCookie(): AppLocale {
  const stored = document.cookie.split("; ").find((c) => c.startsWith(`${LOCALE_COOKIE}=`))?.split("=")[1];
  return isLocale(stored) ? stored : defaultLocale;
}

const ChangeLocale = createContext<(locale: AppLocale) => Promise<void>>(async () => {});

/** Switches the loaded language in place (no reload). The caller writes the cookie. */
export function useChangeLocale() {
  return useContext(ChangeLocale);
}

/** Reads the language from the cookie and loads its messages in the browser; nothing is rendered on a server. */
export function IntlRoot({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ locale: AppLocale; messages: Record<string, unknown> } | null>(null);

  const change = useCallback(async (locale: AppLocale) => {
    const messages = await loadMessages(locale);
    document.documentElement.lang = locale;
    setState({ locale, messages });
  }, []);

  useEffect(() => {
    void change(readLocaleCookie());
  }, [change]);

  if (!state) return null;
  return (
    <ChangeLocale.Provider value={change}>
      <NextIntlClientProvider locale={state.locale} messages={state.messages} timeZone="Asia/Dhaka">
        {children}
      </NextIntlClientProvider>
    </ChangeLocale.Provider>
  );
}
