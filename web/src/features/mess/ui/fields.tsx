"use client";

import { Input } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import { formatNumber } from "@/lib/format";
import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes } from "react";

/** Schema messages are "v:<key>" and translate through mess.validation; server messages pass through. */
export function useFieldMessage() {
  const t = useTranslations("mess");
  return (message?: string): string | undefined => {
    if (!message) return undefined;
    if (message.startsWith("v:")) {
      const key = `validation.${message.slice(2)}`;
      return t.has(key) ? t(key) : message;
    }
    return message;
  };
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "children" | "className"> & { ref?: Ref<HTMLInputElement> };

/**
 * Deliberately not wrapped in HeroUI's TextField: that wrapper makes the input controlled by
 * react-aria state, which wipes the default values react-hook-form writes into the DOM.
 */
export function TextInputField({
  label,
  error,
  description,
  ...input
}: { label: string; error?: string; description?: string } & InputProps) {
  const message = useFieldMessage()(error);
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input id={id} fullWidth aria-invalid={!!message} data-invalid={message ? "true" : undefined} {...input} />
      {description ? <p className="text-xs text-muted">{description}</p> : null}
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted disabled:opacity-60";

export function SelectField({
  label,
  error,
  children,
  ...select
}: { label: string; error?: string; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & {
    ref?: Ref<HTMLSelectElement>;
  }) {
  const id = useId();
  const message = useFieldMessage()(error);
  return (
    <div className="flex w-full flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} aria-invalid={!!message} className={CONTROL} {...select}>
        {children}
      </select>
      {message ? (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

export function CheckboxField({
  label,
  description,
  ...input
}: { label: string; description?: string } & Omit<InputProps, "type">) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--accent)]" {...input} />
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {description ? <span className="text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

/** Amount in taka plus an explicit "they owe" / "mess owes them" choice (no typed signs). */
export function BalanceInput({
  label,
  amount,
  direction,
  error,
}: {
  label: string;
  amount: InputProps;
  direction: InputProps;
  error?: string;
}) {
  const t = useTranslations("mess");
  const locale = useLocale() as AppLocale;
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="sr-only">{label}</legend>
      <TextInputField
        label={label}
        inputMode="decimal"
        autoComplete="off"
        placeholder={formatNumber(0, locale)}
        error={error}
        description={t("balance.hint")}
        {...amount}
      />
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {(["owes", "credit"] as const).map((value) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              value={value}
              className="size-5 accent-[var(--accent)]"
              {...direction}
              name={direction.name ?? name}
            />
            {t(`balance.${value}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
