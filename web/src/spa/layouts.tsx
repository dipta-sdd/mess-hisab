"use client";

import type { ReactNode } from "react";
import { PhoneGate } from "@/components/auth/phone-gate";
import { InstallBanner } from "@/components/pwa/install-banner";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { OfflineSync } from "@/components/pwa/offline-sync";
import { AppShell } from "@/components/shell/app-shell";
import { LanguageSwitcher } from "@/lib/i18n";
import { MessProvider } from "@/lib/mess/mess-context";
import { ThemeToggle } from "@/lib/theme";

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <OfflineBanner />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <InstallBanner />
        <main className="flex flex-1 flex-col justify-center">{children}</main>
      </div>
    </div>
  );
}

export function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between gap-2">
          <OfflineBanner />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <main>
          <PhoneGate>{children}</PhoneGate>
        </main>
      </div>
    </div>
  );
}

export function MessLayout({ messId, children }: { messId: number; children: ReactNode }) {
  return (
    <MessProvider messId={messId}>
      <OfflineSync />
      <PhoneGate>
        <AppShell>{children}</AppShell>
      </PhoneGate>
    </MessProvider>
  );
}
