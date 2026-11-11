"use client";

import { Suspense, useEffect } from "react";
import { IntlRoot } from "@/i18n/client";
import { Routes } from "./routes";

/** Installs the offline service worker (written by scripts/build-sw.mjs); production builds only. */
function useServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);
}

export function SpaRoot() {
  useServiceWorker();
  return (
    <IntlRoot>
      <Suspense>
        <Routes />
      </Suspense>
    </IntlRoot>
  );
}
