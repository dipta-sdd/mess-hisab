"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { applyTheme, DARK_QUERY, readStoredTheme, saveTheme, systemTheme, type Theme } from "./theme";

const SUN = "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 100-8 4 4 0 000 8z";
const MOON = "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z";

/**
 * One button that flips light/dark. Until the user presses it the device setting is followed
 * (and tracked live); after that the choice is remembered on this device.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const t = useTranslations("common.theme");
  // null until mounted: the server can't know the theme, and the <head> script already painted it.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = readStoredTheme();
    setTheme(stored ?? systemTheme());
    if (stored || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(DARK_QUERY);
    const follow = () => {
      if (readStoredTheme()) return;
      const next = mq.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    mq.addEventListener?.("change", follow);
    return () => mq.removeEventListener?.("change", follow);
  }, []);

  const toggle = () => {
    const next: Theme = (theme ?? systemTheme()) === "dark" ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
    setTheme(next);
  };

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={theme === null ? undefined : isDark}
      aria-label={t("dark")}
      title={isDark ? t("switchToLight") : t("switchToDark")}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-default ${className}`}
    >
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="size-5">
        <path d={isDark ? SUN : MOON} />
      </svg>
    </button>
  );
}
