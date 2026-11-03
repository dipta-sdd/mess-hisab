"use client";

import { useTranslations } from "next-intl";
import { useMe } from "@/lib/api-client/auth";
import { useMess } from "@/lib/mess/mess-context";
import { MemberDashboard } from "./member-dashboard";

/** The signed-in member's own balance. Staff get the mess-wide dashboard at /admin. */
export function DashboardPage({ initialMonthId = null }: { initialMonthId?: number | null }) {
  const { messId } = useMess();
  const t = useTranslations("dashboard");
  const meQ = useMe();

  if (meQ.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p role="status" className="text-muted">{t("loading")}</p>
      </div>
    );
  }

  const membership = meQ.data?.memberships.find((m) => m.mess_id === messId);
  // Everyone, staff included, lands on their own balance. The mess-wide dashboard lives at /admin.
  if (!membership) return null;
  return <MemberDashboard memberId={membership.member_id} initialMonthId={initialMonthId} />;
}
