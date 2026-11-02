"use client";

import { Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useMessDetail, useMessRoles } from "@/features/mess/api";
import { ErrorAlert } from "@/features/mess/ui/errors";
import { useMess } from "@/lib/mess/mess-context";
import { SettingsForm } from "./settings-form";

export function SettingsPage() {
  const t = useTranslations("settings");
  const { messId } = useMess();
  const detail = useMessDetail(messId);
  const roles = useMessRoles(messId);

  if (detail.isPending) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t("loading")}>
        <Spinner />
      </div>
    );
  }
  if (detail.isError) return <ErrorAlert message={t("loadFailed")} />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      {/* key resets the form when the server copy changes identity (e.g. switching mess) */}
      <SettingsForm key={messId} mess={detail.data.mess} messId={messId} readOnly={!roles.canAdmin} />
    </div>
  );
}
