"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Chip, Spinner } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { AppLocale } from "@/i18n/config";
import { CodeForm, PHONE_INVALID, isBdMobile, phoneForApi, useAuthFieldMessage, useOtpErrorText } from "@/features/auth";
import { ErrorAlert, SuccessAlert, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { localizeDigits } from "@/lib/format";
import { isApiError } from "@/lib/api-client/errors";
import { useMe } from "@/lib/api-client/auth";
import { useConfirmPhoneChange, useSendPhoneChange } from "./phone-api";

const schema = z.object({ phone: z.string().trim().min(1, "v:required").refine(isBdMobile, PHONE_INVALID) });
type Values = z.infer<typeof schema>;

type Step = { name: "view" } | { name: "enter" } | { name: "code"; phone: string; resendAt: number };

/** Profile card: current phone + verified badge, and the change flow (new phone -> SMS code -> done). */
export function PhoneCard() {
  const t = useTranslations("auth");
  const locale = useLocale() as AppLocale;
  const me = useMe();
  const [step, setStep] = useState<Step>({ name: "view" });
  const [done, setDone] = useState(false);

  if (me.isPending) {
    return (
      <div className="flex justify-center py-6" role="status" aria-label={t("callback.working")}>
        <Spinner />
      </div>
    );
  }
  const user = me.data?.user;
  if (!user) return null;

  const shown = user.phone ? localizeDigits(user.phone, locale) : null;

  return (
    <Card.Root className="w-full">
      <Card.Header className="flex flex-col gap-1">
        <Card.Title className="text-lg font-semibold">{t("phoneCard.title")}</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4">
        {step.name === "view" ? (
          <>
            {done ? <SuccessAlert message={t("phoneCard.done")} /> : null}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted">{t("phoneCard.current")}</span>
              <span className="font-medium" dir="ltr">
                {shown ?? t("phoneCard.none")}
              </span>
              {user.phone ? (
                <Chip.Root size="sm" color={user.phone_verified ? "success" : "warning"}>
                  <Chip.Label>{user.phone_verified ? t("phoneCard.verified") : t("phoneCard.unverified")}</Chip.Label>
                </Chip.Root>
              ) : null}
            </div>
            <div>
              <Button
                type="button"
                variant="secondary"
                onPress={() => {
                  setDone(false);
                  setStep({ name: "enter" });
                }}
              >
                {t("phoneCard.change")}
              </Button>
            </div>
          </>
        ) : null}
        {step.name === "enter" ? (
          <NewPhoneForm
            onCancel={() => setStep({ name: "view" })}
            onSent={(phone, resendAt) => setStep({ name: "code", phone, resendAt })}
          />
        ) : null}
        {step.name === "code" ? (
          <ConfirmStep
            phone={step.phone}
            resendAt={step.resendAt}
            onCancel={() => setStep({ name: "view" })}
            onDone={() => {
              setDone(true);
              setStep({ name: "view" });
            }}
          />
        ) : null}
      </Card.Content>
    </Card.Root>
  );
}

function NewPhoneForm({ onCancel, onSent }: { onCancel: () => void; onSent: (phone: string, resendAt: number) => void }) {
  const t = useTranslations("auth");
  const send = useSendPhoneChange();
  const fieldMessage = useAuthFieldMessage();
  const errorText = useOtpErrorText();
  const [error, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { phone: "" } });
  const form = useFormError<Values>(setError);

  const onSubmit = handleSubmit(async (values) => {
    form.clear();
    setMessage(null);
    const phone = phoneForApi(values.phone);
    try {
      const sent = await send.mutateAsync(phone);
      onSent(phone, Date.parse(sent.resend_at));
    } catch (e) {
      if (isApiError(e) && e.isValidation) form.handle(e);
      else setMessage(errorText(e));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <ErrorAlert message={error ?? form.message} />
      <TextInputField
        label={t("phoneCard.newPhone")}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        description={t("fields.phoneHint")}
        error={fieldMessage(errors.phone?.message)}
        {...register("phone")}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" isPending={send.isPending}>
          {t("phoneCard.sendCode")}
        </Button>
        <Button type="button" variant="ghost" onPress={onCancel}>
          {t("phoneCard.cancel")}
        </Button>
      </div>
    </form>
  );
}

function ConfirmStep({
  phone,
  resendAt,
  onCancel,
  onDone,
}: {
  phone: string;
  resendAt: number;
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("auth");
  const locale = useLocale() as AppLocale;
  const send = useSendPhoneChange();
  const confirm = useConfirmPhoneChange();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{t("phoneCard.codeSubtitle", { phone: localizeDigits(phone, locale) })}</p>
      <CodeForm
        submitLabel={t("phoneCard.confirm")}
        initialResendAt={resendAt}
        onSubmit={async (code) => {
          await confirm.mutateAsync({ phone, code });
          onDone();
        }}
        onResend={async () => Date.parse((await send.mutateAsync(phone)).resend_at)}
      />
      <div>
        <Button type="button" variant="ghost" onPress={onCancel}>
          {t("phoneCard.cancel")}
        </Button>
      </div>
    </div>
  );
}
