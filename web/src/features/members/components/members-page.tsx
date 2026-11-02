"use client";

import { Button, Card, Spinner } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useMessRoles } from "@/features/mess/api";
import { ErrorAlert } from "@/features/mess/ui/errors";
import { SelectField } from "@/features/mess/ui/fields";
import type { Member } from "@/lib/api/contract";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";
import { useMess } from "@/lib/mess/mess-context";
import { useMembers } from "../api";
import { AddMemberForm } from "./add-member-form";
import { InvitesPanel } from "./invites-panel";
import { MemberRowActions } from "./member-row-actions";
import { RolesPanel } from "./roles-panel";

type Filter = "active" | "archived" | "all";

function MemberRow({ member }: { member: Member }) {
  const t = useTranslations("members");
  const locale = useLocale() as AppLocale;
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{member.display_name}</span>
        <span className="flex flex-wrap gap-2 text-xs text-muted">
          {member.is_admin ? <span>{t("badge.admin")}</span> : null}
          {member.is_manager ? <span>{t("badge.manager")}</span> : null}
          {member.archived_at ? <span>{t("badge.archived")}</span> : null}
          {!member.has_account && !member.archived_at ? <span>{t("badge.noAccount")}</span> : null}
        </span>
      </div>
      <p className="text-xs text-muted">
        {t("joined", { date: formatDate(member.joined_on, locale) })}
        {member.left_on ? ` · ${t("left", { date: formatDate(member.left_on, locale) })}` : ""}
      </p>
      <MemberRowActions member={member} />
    </li>
  );
}

export function MembersPage() {
  const t = useTranslations("members");
  const { messId } = useMess();
  const roles = useMessRoles(messId);
  const members = useMembers(messId);
  const [filter, setFilter] = useState<Filter>("active");
  const [adding, setAdding] = useState(false);

  if (members.isPending || !roles.ready) {
    return (
      <div className="flex justify-center py-10" role="status" aria-label={t("loading")}>
        <Spinner />
      </div>
    );
  }
  if (members.isError) return <ErrorAlert message={t("loadFailed")} />;

  const all = members.data;
  const shown = all.filter((m) =>
    filter === "all" ? true : filter === "archived" ? !!m.archived_at : !m.archived_at,
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {roles.canManage && !adding ? (
          <Button variant="primary" onPress={() => setAdding(true)}>
            {t("add.button")}
          </Button>
        ) : null}
      </header>

      {!roles.canManage ? <p className="text-sm text-muted">{t("readOnly")}</p> : null}
      {adding && roles.canManage ? <AddMemberForm onDone={() => setAdding(false)} /> : null}

      <Card.Root>
        <Card.Content className="flex flex-col gap-4">
          <SelectField label={t("filter.label")} value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="active">{t("filter.active")}</option>
            <option value="archived">{t("filter.archived")}</option>
            <option value="all">{t("filter.all")}</option>
          </SelectField>
          {shown.length === 0 ? <p className="text-sm text-muted">{t("empty")}</p> : null}
          <ul className="flex flex-col gap-2">
            {shown.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
        </Card.Content>
      </Card.Root>

      {roles.canManage ? <InvitesPanel members={all} /> : null}
      {roles.canAdmin ? <RolesPanel members={all} /> : null}
    </div>
  );
}
