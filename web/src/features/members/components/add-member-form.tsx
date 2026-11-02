"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { todayInDhaka } from "@/lib/format";
import { parseTakaOrNull, signedPaisa } from "@/features/mess/money";
import { balanceDirection, isoDate, optionalTaka, requiredName } from "@/features/mess/schemas";
import { ErrorAlert, useFormError } from "@/features/mess/ui/errors";
import { BalanceInput, TextInputField } from "@/features/mess/ui/fields";
import { useMess } from "@/lib/mess/mess-context";
import { useAddMember, type AddMemberPayload } from "../api";

const schema = z.object({
  display_name: requiredName,
  joined_on: isoDate,
  amount: optionalTaka,
  direction: balanceDirection,
});
type Values = z.infer<typeof schema>;

export function AddMemberForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("members");
  const { messId } = useMess();
  const add = useAddMember(messId);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { display_name: "", joined_on: todayInDhaka(), amount: "", direction: "owes" },
  });
  const form = useFormError<Values>(setError, (f) => (f === "opening_balance_paisa" ? "amount" : f));

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    const paisa = values.amount.trim() === "" ? 0 : (parseTakaOrNull(values.amount) ?? 0);
    const payload: AddMemberPayload = { display_name: values.display_name.trim(), joined_on: values.joined_on };
    if (paisa !== 0) payload.opening_balance_paisa = signedPaisa(paisa, values.direction);
    try {
      await add.mutateAsync(payload);
      onDone();
    } catch (error) {
      form.handle(error);
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t("add.title")}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <h2 className="text-lg font-semibold">{t("add.title")}</h2>
      <ErrorAlert message={form.message} />
      <TextInputField label={t("fields.displayName")} error={errors.display_name?.message} {...register("display_name")} />
      <TextInputField label={t("fields.joinedOn")} type="date" error={errors.joined_on?.message} {...register("joined_on")} />
      <BalanceInput
        label={t("fields.openingBalance")}
        amount={register("amount")}
        direction={register("direction")}
        error={errors.amount?.message}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" isPending={add.isPending}>
          {t("add.submit")}
        </Button>
        <Button type="button" variant="ghost" onPress={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
