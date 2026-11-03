"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { Mess } from "@/lib/api/contract";
import { MEAL_ENTRY_BY, MEAL_TRACKINGS, ROUNDING_MODES } from "@/lib/api/contract";
import { parseMealsOrNull, parseTakaOrNull, scaledToInput } from "@/features/mess/money";
import { integerInRange, requiredMeals, requiredName, requiredTaka } from "@/features/mess/schemas";
import { ErrorAlert, SuccessAlert, useFormError } from "@/features/mess/ui/errors";
import { CheckboxField, SelectField, TextInputField } from "@/features/mess/ui/fields";
import { useUpdateSettings, type SettingsPayload } from "../api";

const schema = z.object({
  name: requiredName,
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "v:currency"),
  month_start_day: integerInRange(1, 28),
  approval_required: z.boolean(),
  meal_tracking: z.enum(MEAL_TRACKINGS),
  meal_entry_by: z.enum(MEAL_ENTRY_BY),
  breakfast_weight: requiredMeals,
  lunch_weight: requiredMeals,
  dinner_weight: requiredMeals,
  rounding_mode: z.enum(ROUNDING_MODES),
  min_meals_enabled: z.boolean(),
  min_meals: z.string(),
  min_payable_enabled: z.boolean(),
  min_payable: z.string(),
  deposit: requiredTaka,
  fixed_due_day_offset: integerInRange(1, 31),
  deposit_due_day_offset: integerInRange(1, 31),
});
type Values = z.infer<typeof schema>;

const FIELD_MAP: Record<string, keyof Values> = {
  breakfast_weight_centi: "breakfast_weight",
  lunch_weight_centi: "lunch_weight",
  dinner_weight_centi: "dinner_weight",
  min_meals_centi: "min_meals",
  min_payable_paisa: "min_payable",
  deposit_paisa: "deposit",
};

function toValues(mess: Mess): Values {
  return {
    name: mess.name,
    currency: mess.currency,
    month_start_day: String(mess.month_start_day),
    approval_required: mess.approval_required,
    meal_tracking: mess.meal_tracking,
    meal_entry_by: mess.meal_entry_by,
    breakfast_weight: scaledToInput(mess.breakfast_weight_centi),
    lunch_weight: scaledToInput(mess.lunch_weight_centi),
    dinner_weight: scaledToInput(mess.dinner_weight_centi),
    rounding_mode: mess.rounding_mode,
    min_meals_enabled: mess.min_meals_enabled,
    min_meals: mess.min_meals_centi === null ? "" : scaledToInput(mess.min_meals_centi),
    min_payable_enabled: mess.min_payable_enabled,
    min_payable: mess.min_payable_paisa === null ? "" : scaledToInput(mess.min_payable_paisa),
    deposit: scaledToInput(mess.deposit_paisa),
    fixed_due_day_offset: String(mess.fixed_due_day_offset),
    deposit_due_day_offset: String(mess.deposit_due_day_offset),
  };
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-4 py-6 first:pt-0 last:pb-0 lg:grid-cols-[14rem_1fr] lg:gap-10">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
      </div>
      <div className="flex max-w-xl flex-col gap-3">{children}</div>
    </section>
  );
}

export function SettingsForm({ mess, messId, readOnly }: { mess: Mess; messId: number; readOnly: boolean }) {
  const t = useTranslations("settings");
  const update = useUpdateSettings(messId);
  const [saved, setSaved] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(mess) });
  const form = useFormError<Values>(setError, (f) => (FIELD_MAP[f] as string | undefined) ?? f);

  const tracking = watch("meal_tracking");
  const minMealsOn = watch("min_meals_enabled");
  const minPayableOn = watch("min_payable_enabled");

  const onSubmit = handleSubmit(async (v) => {
    form.clear();
    setSaved(false);
    const minMeals = v.min_meals.trim() === "" ? null : parseMealsOrNull(v.min_meals);
    const minPayable = v.min_payable.trim() === "" ? null : parseTakaOrNull(v.min_payable);
    if (v.min_meals_enabled && minMeals === null) {
      setError("min_meals", { message: "v:invalidMeals" });
      return;
    }
    if (v.min_payable_enabled && minPayable === null) {
      setError("min_payable", { message: "v:invalidAmount" });
      return;
    }
    const payload: SettingsPayload = {
      name: v.name.trim(),
      currency: v.currency.trim().toUpperCase(),
      month_start_day: Number(v.month_start_day),
      approval_required: v.approval_required,
      meal_tracking: v.meal_tracking,
      meal_entry_by: v.meal_entry_by,
      breakfast_weight_centi: parseMealsOrNull(v.breakfast_weight) ?? 0,
      lunch_weight_centi: parseMealsOrNull(v.lunch_weight) ?? 0,
      dinner_weight_centi: parseMealsOrNull(v.dinner_weight) ?? 0,
      rounding_mode: v.rounding_mode,
      min_meals_enabled: v.min_meals_enabled,
      min_meals_centi: v.min_meals_enabled ? minMeals : null,
      min_payable_enabled: v.min_payable_enabled,
      min_payable_paisa: v.min_payable_enabled ? minPayable : null,
      deposit_paisa: parseTakaOrNull(v.deposit) ?? 0,
      fixed_due_day_offset: Number(v.fixed_due_day_offset),
      deposit_due_day_offset: Number(v.deposit_due_day_offset),
    };
    try {
      await update.mutateAsync(payload);
      reset(v);
      setSaved(true);
    } catch (error) {
      form.handle(error);
    }
  });

  const e = (k: keyof Values) => errors[k]?.message as string | undefined;

  return (
    <form onSubmit={onSubmit} noValidate aria-label={t("title")} className="flex flex-col gap-4">
      <ErrorAlert message={form.message} />
      {saved ? <SuccessAlert message={t("saved")} /> : null}
      <fieldset disabled={readOnly} className="min-w-0 divide-y divide-border rounded-2xl border border-border bg-surface p-4 md:p-6">
        <Section title={t("general.title")}>
          <TextInputField label={t("general.name")} error={e("name")} {...register("name")} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInputField label={t("general.currency")} error={e("currency")} {...register("currency")} />
            <TextInputField
              label={t("general.monthStartDay")}
              description={t("general.monthStartDayHint")}
              inputMode="numeric"
              error={e("month_start_day")}
              {...register("month_start_day")}
            />
          </div>
          <CheckboxField
            label={t("general.approvalRequired")}
            description={t("general.approvalRequiredHint")}
            {...register("approval_required")}
          />
        </Section>

        <Section title={t("meals.title")}>
          <SelectField label={t("meals.tracking")} error={e("meal_tracking")} {...register("meal_tracking")}>
            {MEAL_TRACKINGS.map((m) => (
              <option key={m} value={m}>
                {t(`meals.trackingOptions.${m}`)}
              </option>
            ))}
          </SelectField>
          <SelectField label={t("meals.entryBy")} error={e("meal_entry_by")} {...register("meal_entry_by")}>
            {MEAL_ENTRY_BY.map((m) => (
              <option key={m} value={m}>
                {t(`meals.entryByOptions.${m}`)}
              </option>
            ))}
          </SelectField>
          {tracking === "bld_ticks" ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInputField
                label={t("meals.breakfastWeight")}
                inputMode="decimal"
                error={e("breakfast_weight")}
                {...register("breakfast_weight")}
              />
              <TextInputField
                label={t("meals.lunchWeight")}
                inputMode="decimal"
                error={e("lunch_weight")}
                {...register("lunch_weight")}
              />
              <TextInputField
                label={t("meals.dinnerWeight")}
                inputMode="decimal"
                error={e("dinner_weight")}
                {...register("dinner_weight")}
              />
              <p className="text-sm text-muted sm:col-span-3">{t("meals.weightsHint")}</p>
            </div>
          ) : null}
        </Section>

        <Section title={t("rounding.title")} hint={t("rounding.hint")}>
          <SelectField label={t("rounding.mode")} error={e("rounding_mode")} {...register("rounding_mode")}>
            {ROUNDING_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`rounding.options.${m}`)}
              </option>
            ))}
          </SelectField>
        </Section>

        <Section title={t("minimums.title")} hint={t("minimums.hint")}>
          <CheckboxField
            label={t("minimums.minMealsEnabled")}
            {...register("min_meals_enabled", {
              onChange: (ev) => {
                if (!ev.target.checked) setValue("min_meals", "");
              },
            })}
          />
          {minMealsOn ? (
            <TextInputField
              label={t("minimums.minMeals")}
              inputMode="decimal"
              error={e("min_meals")}
              {...register("min_meals")}
            />
          ) : null}
          <CheckboxField
            label={t("minimums.minPayableEnabled")}
            {...register("min_payable_enabled", {
              onChange: (ev) => {
                if (!ev.target.checked) setValue("min_payable", "");
              },
            })}
          />
          {minPayableOn ? (
            <TextInputField
              label={t("minimums.minPayable")}
              inputMode="decimal"
              error={e("min_payable")}
              {...register("min_payable")}
            />
          ) : null}
        </Section>

        <Section title={t("deposit.title")}>
          <TextInputField
            label={t("deposit.amount")}
            inputMode="decimal"
            description={t("deposit.amountHint")}
            error={e("deposit")}
            {...register("deposit")}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInputField
              label={t("deposit.fixedDueOffset")}
              inputMode="numeric"
              error={e("fixed_due_day_offset")}
              {...register("fixed_due_day_offset")}
            />
            <TextInputField
              label={t("deposit.depositDueOffset")}
              inputMode="numeric"
              error={e("deposit_due_day_offset")}
              {...register("deposit_due_day_offset")}
            />
          </div>
          <p className="text-sm text-muted">{t("deposit.offsetHint")}</p>
        </Section>
      </fieldset>

      {readOnly ? (
        <p className="text-sm text-muted">{t("readOnly")}</p>
      ) : (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex justify-end border-t border-border bg-background px-4 py-3 md:bottom-0 md:-mx-6 md:px-6">
          <Button type="submit" variant="primary" className="w-full sm:w-auto" isDisabled={!isDirty} isPending={update.isPending}>
            {t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
