"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** Shown while the device has no connection. The app itself keeps working from its saved copy. */
export function OfflineBanner() {
  const t = useTranslations("app");
  if (useOnline()) return null;
  return (
    <p role="status" className="rounded-lg bg-warning/15 px-3 py-1.5 text-sm text-warning-foreground" data-testid="offline-banner">
      {t("offline")}
    </p>
  );
}
