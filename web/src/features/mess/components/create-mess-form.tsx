"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { messHomePath, useCreateMess, type CreateMessPayload } from "../api";
import { formatNumber, todayInDhaka } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";
import { parseTakaOrNull, signedPaisa } from "../money";
import { balanceDirection, integerInRange, isoDate, optionalTaka, requiredName } from "../schemas";
import { ErrorAlert, useFormError } from "../ui/errors";
import { BalanceInput, TextInputField } from "../ui/fields";

const schema = z.object({
  name: requiredName,
  month_start_day: integerInRange(1, 28),
  first_month_starts_on: isoDate,
  creator_display_name: requiredName,
  creator_amount: optionalTaka,
  creator_direction: balanceDirection,
  members: z.array(z.object({ display_name: requiredName, amount: optionalTaka, direction: balanceDirection })).max(50),
});
type Values = z.infer<typeof schema>;

function openingOf(amount: string, direction: "owes" | "credit"): number | undefined {
  const paisa = amount.trim() === "" ? 0 : parseTakaOrNull(amount);
  if (!paisa) return undefined;
  return signedPaisa(paisa, direction);
}

/** API field -> form field. */
function mapField(field: string): string | null {
  if (field === "creator_opening_balance_paisa") return "creator_amount";
  const member = /^members\.(\d+)\.opening_balance_paisa$/.exec(field);
  if (member) return `members.${member[1]}.amount`;
  if (field === "members") return null;
  return field;
}

export function CreateMessForm({ defaultName = "" }: { defaultName?: string }) {
  const t = useTranslations("mess");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const create = useCreateMess();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      month_start_day: "1",
      first_month_starts_on: todayInDhaka().slice(0, 8) + "01",
      creator_display_name: defaultName,
      creator_amount: "",
      creator_direction: "owes",
      members: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "members" });
  const form = useFormError<Values>(setError, mapField);

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    const payload: CreateMessPayload = {
      name: values.name.trim(),
      month_start_day: Number(values.month_start_day),
      first_month_starts_on: values.first_month_starts_on,
      creator_display_name: values.creator_display_name.trim(),
    };
    const creatorOpening = openingOf(values.creator_amount, values.creator_direction);
    if (creatorOpening !== undefined) payload.creator_opening_balance_paisa = creatorOpening;
    if (values.members.length > 0) {
      payload.members = values.members.map((m) => {
        const opening = openingOf(m.amount, m.direction);
        return opening === undefined
          ? { display_name: m.display_name.trim() }
          : { display_name: m.display_name.trim(), opening_balance_paisa: opening };
      });
    }
    try {
      const { mess } = await create.mutateAsync(payload);
      router.replace(messHomePath(mess.id));
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5" aria-label={t("create.title")}>
      <ErrorAlert message={form.message} />

      <TextInputField label={t("create.name")} error={errors.name?.message} {...register("name")} />

      <div className="grid gap-4 sm:grid-cols-2">
        <TextInputField
          label={t("create.monthStartDay")}
          description={t("create.monthStartDayHint")}
          inputMode="numeric"
          error={errors.month_start_day?.message}
          {...register("month_start_day")}
        />
        <TextInputField
          label={t("create.firstMonthStartsOn")}
          type="date"
          error={errors.first_month_starts_on?.message}
          {...register("first_month_starts_on")}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border p-3">
        <h3 className="text-sm font-semibold">{t("create.you")}</h3>
        <TextInputField
          label={t("create.yourName")}
          description={t("create.yourNameHint")}
          error={errors.creator_display_name?.message}
          {...register("creator_display_name")}
        />
        <BalanceInput
          label={t("create.yourBalance")}
          amount={register("creator_amount")}
          direction={register("creator_direction")}
          error={errors.creator_amount?.message}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("create.others")}</h3>
          <p className="text-sm text-muted">{t("create.othersHint")}</p>
        </div>
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <TextInputField
              label={t("create.memberName", { n: formatNumber(index + 1, locale) })}
              error={errors.members?.[index]?.display_name?.message}
              {...register(`members.${index}.display_name`)}
            />
            <BalanceInput
              label={t("create.memberBalance", { n: formatNumber(index + 1, locale) })}
              amount={register(`members.${index}.amount`)}
              direction={register(`members.${index}.direction`)}
              error={errors.members?.[index]?.amount?.message}
            />
            <Button type="button" variant="ghost" onPress={() => remove(index)}>
              {t("create.removeMember", { n: formatNumber(index + 1, locale) })}
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onPress={() => append({ display_name: "", amount: "", direction: "owes" })}
        >
          {t("create.addMember")}
        </Button>
      </section>

      <Button type="submit" variant="primary" fullWidth isPending={create.isPending}>
        {t("create.submit")}
      </Button>
    </form>
  );
}
