"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card } from "@heroui/react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useLogout } from "@/features/auth";
import { ErrorAlert, SuccessAlert, useFormError } from "@/features/mess/ui/errors";
import { TextInputField } from "@/features/mess/ui/fields";
import { PhoneCard } from "@/features/settings/phone-card";
import { apiClient } from "@/lib/api-client/client";
import { meQueryKey, useMe } from "@/lib/api-client/auth";

const schema = z.object({ name: z.string().trim().min(1, "v:required").max(100, "v:tooLong") });
type Values = z.infer<typeof schema>;

function NameCard({ name }: { name: string }) {
  const t = useTranslations("common.profile");
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const { register, handleSubmit, formState, setError } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name } });
  const { message, handle, clear } = useFormError<Values>(setError);

  const onSubmit = handleSubmit(async (values) => {
    clear();
    setSaved(false);
    try {
      await apiClient.patch("/api/auth/me", { name: values.name });
      await queryClient.invalidateQueries({ queryKey: meQueryKey });
      setSaved(true);
    } catch (error) {
      handle(error);
    }
  });

  return (
    <Card.Root className="w-full">
      <Card.Header>
        <Card.Title className="text-lg font-semibold">{t("nameTitle")}</Card.Title>
      </Card.Header>
      <Card.Content>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
          {saved ? <SuccessAlert message={t("saved")} /> : null}
          {message ? <ErrorAlert message={message} /> : null}
          <TextInputField label={t("nameLabel")} autoComplete="name" error={formState.errors.name?.message} {...register("name")} />
          <div>
            <Button type="submit" isPending={formState.isSubmitting}>
              {t("save")}
            </Button>
          </div>
        </form>
      </Card.Content>
    </Card.Root>
  );
}

/** The signed-in person's own account: name, phone, and logging out. Same for every mess. */
export function ProfilePage() {
  const t = useTranslations("common.profile");
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();
  const user = me.data?.user;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {user ? <NameCard key={user.id} name={user.name} /> : null}
      <PhoneCard />
      <Card.Root className="w-full">
        <Card.Header>
          <Card.Title className="text-lg font-semibold">{t("logoutTitle")}</Card.Title>
          <Card.Description>{t("logoutHint")}</Card.Description>
        </Card.Header>
        <Card.Content>
          {logout.isError ? <ErrorAlert message={t("logoutFailed")} /> : null}
          <div>
            <Button
              variant="danger"
              isPending={logout.isPending}
              onPress={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
            >
              {t("logout")}
            </Button>
          </div>
        </Card.Content>
      </Card.Root>
    </div>
  );
}
