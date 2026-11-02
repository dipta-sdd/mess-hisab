"use client";

import { buttonVariants } from "@heroui/react";
import { useTranslations } from "next-intl";
import { API_BASE_URL } from "@/lib/api-client/client";
import { stashNext } from "../next-path";

/** Parked while GOOGLE_SIGN_IN_ENABLED is false; nothing renders it. */
export function GoogleButton({ next }: { next: string | null }) {
  const t = useTranslations("auth");
  return (
    <a
      href={`${API_BASE_URL}/api/auth/google/redirect`}
      onClick={() => stashNext(next)}
      className={buttonVariants({ variant: "outline", fullWidth: true })}
    >
      {t("google")}
    </a>
  );
}
