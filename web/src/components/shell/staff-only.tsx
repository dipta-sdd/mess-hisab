"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMe } from "@/lib/api-client/auth";
import { useMess } from "@/lib/mess/mess-context";
import { rolesOf } from "./nav-items";

/** Shows its children to admins/managers; ordinary members get a short friendly message instead. */
export function StaffOnly({ children }: { children: React.ReactNode }) {
  const t = useTranslations("common.staffOnly");
  const { messId } = useMess();
  const me = useMe();
  const membership = me.data?.memberships.find((m) => m.mess_id === messId);
  // Until the membership is known (or if it cannot be loaded) let the page decide; the server enforces access.
  if (!membership) return me.isPending ? null : <>{children}</>;
  const roles = rolesOf(membership);
  if (roles.has("admin") || roles.has("manager")) return <>{children}</>;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-12 text-center">
      <p role="status" className="text-lg font-semibold">{t("message")}</p>
      <Link href={`/${messId}`} className="text-sm font-medium text-accent underline">
        {t("back")}
      </Link>
    </div>
  );
}
