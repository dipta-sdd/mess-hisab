"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { fieldClassInvalid } from "@/components/ui/field";

export type NewBillSplit = "equal" | "fixed_per_person";

/** Name + how it is shared. The caller decides what happens on submit (create now, or keep as a draft). */
export function AddBillForm({
  onSubmit,
  onCancel,
  pending = false,
  error = null,
}: {
  onSubmit: (name: string, split: NewBillSplit) => void;
  onCancel: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const t = useTranslations("fixed.addBill");
  const id = useId();
  const [name, setName] = useState("");
  const [split, setSplit] = useState<NewBillSplit>("equal");
  const [missing, setMissing] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed === "") return setMissing(true);
    setMissing(false);
    onSubmit(trimmed, split);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("hint")}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">{t("name")}</label>
        <input
          id={`${id}-name`}
          className={fieldClassInvalid}
          maxLength={100}
          autoComplete="off"
          placeholder={t("namePlaceholder")}
          value={name}
          aria-invalid={missing || undefined}
          onChange={(e) => setName(e.target.value)}
        />
        {missing ? <p role="alert" className="text-sm text-danger">{t("needName")}</p> : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("split")}</legend>
        {(["equal", "fixed_per_person"] as const).map((value) => (
          <label key={value} className="flex min-h-11 items-start gap-2">
            <input
              type="radio"
              name={`${id}-split`}
              className="mt-1 size-5 accent-[var(--accent)]"
              checked={split === value}
              onChange={() => setSplit(value)}
            />
            <span>
              <span className="block font-medium">{t(value)}</span>
              <span className="block text-sm text-muted">{t(`${value}Help`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {error ? <p role="alert" className="rounded-lg border border-danger bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="w-full sm:w-auto" onPress={onCancel} isDisabled={pending}>{t("cancel")}</Button>
        <Button type="submit" variant="primary" className="w-full sm:w-auto" isDisabled={pending}>{pending ? t("submitting") : t("submit")}</Button>
      </div>
    </form>
  );
}
