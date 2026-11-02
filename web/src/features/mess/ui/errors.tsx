"use client";

import { Alert } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { isApiError } from "@/lib/api-client/errors";

/** Turns anything thrown by apiClient into a translated, human message. */
export function useApiErrorText() {
  const common = useTranslations("common");
  const t = useTranslations("mess");

  return useCallback(
    (error: unknown): string => {
      if (isApiError(error)) {
        if (error.code && t.has(`apiCodes.${error.code}`)) return t(`apiCodes.${error.code}`);
        if (error.status === 403) return common("errors.forbidden");
        if (error.status === 404) return common("errors.notFound");
        if (error.status === 422) return error.message;
        if (error.status >= 500) return common("errors.generic");
        return error.message || common("errors.generic");
      }
      return common("errors.network");
    },
    [common, t],
  );
}

/**
 * Form-level error handling: 422 field errors land on their inputs via setError,
 * everything else becomes `message` for an <ErrorAlert>. `mapField` renames API fields to
 * form fields; return null to show that message in the alert instead.
 */
export function useFormError<T extends FieldValues>(
  setError: UseFormSetError<T>,
  mapField?: (apiField: string) => string | null,
) {
  const text = useApiErrorText();
  const [message, setMessage] = useState<string | null>(null);

  const handle = useCallback(
    (error: unknown) => {
      if (isApiError(error) && error.isValidation && Object.keys(error.fieldErrors).length > 0) {
        let general: string | null = null;
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          const target = mapField ? mapField(field) : field;
          if (target) setError(target as Path<T>, { type: "server", message: messages[0] });
          else general ??= messages[0] ?? null;
        }
        setMessage(general);
        return;
      }
      setMessage(text(error));
    },
    [mapField, setError, text],
  );

  const clear = useCallback(() => setMessage(null), []);
  return { message, handle, clear };
}

export function ErrorAlert({ message, className = "" }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <Alert.Root status="danger" className={className}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description role="alert">{message}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}

export function SuccessAlert({ message, className = "" }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <Alert.Root status="success" className={className}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description role="status">{message}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
