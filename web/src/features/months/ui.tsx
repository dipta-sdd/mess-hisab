"use client";

import { useTranslations } from "next-intl";
import { isApiError } from "@/lib/api-client";

export const fieldClass =
  "w-full min-h-11 rounded-lg border border-default-300 bg-background px-3 py-2 text-base text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-accent";

export function Banner({ children }: { children: React.ReactNode }) {
  return <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">{children}</div>;
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <div role="status" className="rounded-lg border border-success bg-success/10 p-3 text-sm">{children}</div>;
}

/**
 * Plain-language text for a failed request. 409 `code`s are looked up in `months.errors.<code>`;
 * a 422 shows the first server message; anything else is generic.
 */
export function useErrorText() {
  const t = useTranslations("months");
  const tc = useTranslations("common");
  return (error: unknown): string => {
    if (!isApiError(error)) return t("errors.generic");
    if (error.isConflict && error.code && t.has(`errors.${error.code}`)) return t(`errors.${error.code}`);
    if (error.isForbidden) return tc("errors.forbidden");
    if (error.isValidation) {
      const first = Object.values(error.fieldErrors)[0]?.[0];
      return first ?? error.message ?? t("errors.generic");
    }
    return t("errors.generic");
  };
}
