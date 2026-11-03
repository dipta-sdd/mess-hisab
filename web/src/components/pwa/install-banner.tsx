"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useInstall } from "./install-context";

const DISMISSED = "install-banner-dismissed";

/** Offers "add to home screen" once the browser says the app is installable. */
export function InstallBanner() {
  const t = useTranslations("app.install");
  const { canPrompt, prompt } = useInstall();
  const [hidden, setHidden] = useState(() => {
    try {
      return Boolean(localStorage.getItem(DISMISSED));
    } catch {
      return false;
    }
  });

  if (!canPrompt || hidden) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <div role="region" aria-label={t("title")} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
      <div className="min-w-0">
        <p className="font-medium">{t("title")}</p>
        <p className="text-sm text-muted">{t("body")}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onPress={dismiss} className="min-h-11">{t("later")}</Button>
        <Button
          variant="primary"
          className="min-h-11"
          onPress={async () => {
            await prompt();
            dismiss();
          }}
        >
          {t("install")}
        </Button>
      </div>
    </div>
  );
}
