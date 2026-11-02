import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import type { AppLocale } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";
import { MessProvider } from "@/lib/mess/mess-context";

type Options = RenderOptions & { locale?: AppLocale; messId?: number };

/** Renders with real merged messages, a fresh QueryClient (no retries) and, if messId is given, the mess context. */
export function renderWithProviders(ui: ReactElement, { locale = "en", messId, ...options }: Options = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const content = messId ? <MessProvider messId={messId}>{ui}</MessProvider> : ui;

  return render(
    <NextIntlClientProvider locale={locale} messages={loadMessages(locale)} timeZone="Asia/Dhaka">
      <QueryClientProvider client={client}>{content}</QueryClientProvider>
    </NextIntlClientProvider>,
    options,
  );
}
