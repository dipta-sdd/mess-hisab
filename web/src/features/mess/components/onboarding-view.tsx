"use client";

import { Card, Chip, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/nav";
import { useRouter } from "@/lib/nav";
import { useEffect } from "react";
import { useSession } from "@/features/auth/api";
import { messHomePath } from "../api";
import { ErrorAlert, useApiErrorText } from "../ui/errors";
import { CreateMessForm } from "./create-mess-form";

export function OnboardingView() {
  const t = useTranslations("mess");
  const router = useRouter();
  const session = useSession();
  const errorText = useApiErrorText();

  useEffect(() => {
    if (session.data === null) router.replace("/login?next=%2Fonboarding");
  }, [session.data, router]);

  if (session.isError) return <ErrorAlert message={errorText(session.error)} />;
  if (!session.data) {
    return (
      <div className="flex items-center gap-3" role="status">
        <Spinner />
        <span>{t("loading")}</span>
      </div>
    );
  }

  const { memberships, user } = session.data;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="your-messes" className="flex flex-col gap-3">
        <h1 id="your-messes" className="text-xl font-semibold">
          {t("pick.title")}
        </h1>
        {memberships.length === 0 ? (
          <p className="text-muted">{t("pick.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {memberships.map((m) => (
              <li key={m.mess_id}>
                <Link
                  href={messHomePath(m.mess_id)}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 hover:bg-default"
                >
                  <span className="min-w-0 truncate font-medium">{m.mess_name}</span>
                  <span className="flex shrink-0 gap-1">
                    {m.is_admin ? (
                      <Chip.Root size="sm">
                        <Chip.Label>{t("roles.admin")}</Chip.Label>
                      </Chip.Root>
                    ) : null}
                    {m.is_manager ? (
                      <Chip.Root size="sm">
                        <Chip.Label>{t("roles.manager")}</Chip.Label>
                      </Chip.Root>
                    ) : null}
                    {m.archived ? (
                      <Chip.Root size="sm">
                        <Chip.Label>{t("roles.archived")}</Chip.Label>
                      </Chip.Root>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card.Root>
        <Card.Header>
          <Card.Title className="text-lg font-semibold">{t("create.title")}</Card.Title>
          <Card.Description>{t("create.subtitle")}</Card.Description>
        </Card.Header>
        <Card.Content>
          <CreateMessForm defaultName={user.name} />
        </Card.Content>
      </Card.Root>
    </div>
  );
}
