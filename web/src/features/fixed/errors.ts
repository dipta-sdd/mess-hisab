import { isApiError } from "@/lib/api-client";

type Translate = (key: string) => string;

const CODES = ["amount_required", "nothing_to_spread", "over_allocated", "category_archived", "month_closed"] as const;

/** Friendly, translated text for a failed fixed-setup request. `t` is useTranslations("fixed"). */
export function explainError(error: unknown, t: Translate): string {
  if (!isApiError(error)) return t("errors.generic");
  if (error.isConflict && error.code && (CODES as readonly string[]).includes(error.code)) return t(`errors.${error.code}`);
  if (error.isForbidden) return t("errors.forbidden");
  if (error.isValidation) {
    const messages = Object.values(error.fieldErrors).flat();
    return messages.length > 0 ? messages.join(" ") : error.message;
  }
  return error.message || t("errors.generic");
}
