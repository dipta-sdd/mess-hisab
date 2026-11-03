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
import { EmailCard, PasswordCard } from "./account-cards";
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

function Identity({ name, email }: { name: string; email: string | null }) {
  return (
    <header className="flex items-center gap-4">
      <span
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xl font-semibold text-accent-soft-foreground"
      >
        {(name.trim()[0] ?? "?").toUpperCase()}
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold text-balance">{name}</h1>
        {email ? <p className="truncate text-sm text-muted">{email}</p> : null}
      </div>
    </header>
  );
}

/** The signed-in person's own account: name, email, password, phone, and logging out. Same for every mess. */
export function ProfilePage() {
  const t = useTranslations("common.profile");
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();
  const user = me.data?.user;

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {user ? <Identity name={user.name} email={user.email} /> : <h1 className="text-2xl font-semibold">{t("title")}</h1>}
      {user ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <NameCard key={`name-${user.id}`} name={user.name} />
          <PhoneCard />
          <EmailCard key={`email-${user.id}-${user.email ?? ""}`} email={user.email} hasPassword={user.has_password} />
          <PasswordCard key={`pw-${user.id}-${user.has_password}`} hasPassword={user.has_password} />
        </div>
      ) : null}
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
