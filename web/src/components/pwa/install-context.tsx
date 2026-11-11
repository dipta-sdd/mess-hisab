"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
}

export interface InstallState {
  /** The browser offered a native install prompt. */
  canPrompt: boolean;
  /** iOS Safari never fires the prompt event; the user has to use Share -> Add to Home Screen. */
  needsManualSteps: boolean;
  /** iOS Safari (Share menu steps) as opposed to any other browser (browser-menu steps). */
  ios: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  prompt: () => Promise<void>;
}

const none: InstallState = { canPrompt: false, needsManualSteps: false, ios: false, installed: false, prompt: async () => undefined };
const InstallContext = createContext<InstallState>(none);

/** Catches `beforeinstallprompt` once for the whole app (it fires early and only once), so any menu or banner can offer the install. */
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(Boolean(standalone));
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const early = (window as Window & { __installEvent?: Event }).__installEvent;
    if (early) setEvent(early as InstallEvent);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => {
      setEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    setEvent(null);
  }, [event]);

  const value = useMemo<InstallState>(
    () => ({ canPrompt: event !== null && !installed, needsManualSteps: event === null && !installed, ios, installed, prompt }),
    [event, installed, ios, prompt],
  );
  return <InstallContext.Provider value={value}>{children}</InstallContext.Provider>;
}

export function useInstall(): InstallState {
  return useContext(InstallContext);
}
