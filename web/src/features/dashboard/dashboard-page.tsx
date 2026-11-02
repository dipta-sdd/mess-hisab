"use client";

import { useTranslations } from "next-intl";
import { rolesOf } from "@/components/shell/nav-items";
import { useMe } from "@/lib/api-client/auth";
import { useMess } from "@/lib/mess/mess-context";
import { MemberDashboard } from "./member-dashboard";
import { StaffDashboard } from "./staff-dashboard";

/** Picks the dashboard by role: admins and managers see the whole mess, everyone else sees their own balance. */
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
  const roles = rolesOf(membership);
  // Unknown membership: fall back to the staff view; the server only returns what the caller may see.
  if (!membership || roles.has("admin") || roles.has("manager")) return <StaffDashboard initialMonthId={initialMonthId} />;
  return <MemberDashboard memberId={membership.member_id} initialMonthId={initialMonthId} />;
}
