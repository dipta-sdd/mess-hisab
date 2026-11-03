"use client";

import { Button, Modal, Spinner } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useMessRoles } from "@/features/mess/api";
import { ErrorAlert } from "@/features/mess/ui/errors";
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

const FILTERS: Filter[] = ["active", "archived", "all"];

function MemberRow({ member }: { member: Member }) {
  const t = useTranslations("members");
  const locale = useLocale() as AppLocale;
  const tags = [
    member.is_admin ? t("badge.admin") : null,
    member.is_manager ? t("badge.manager") : null,
    member.archived_at ? t("badge.archived") : null,
    !member.has_account && !member.archived_at ? t("badge.noAccount") : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 py-3" data-testid={`member-${member.id}`}>
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">
          {member.display_name}
          {tags.length > 0 ? <span className="text-sm font-normal text-muted"> · {tags.join(" · ")}</span> : null}
        </p>
        <p className="text-sm text-muted">
          {t("joined", { date: formatDate(member.joined_on, locale) })}
          {member.left_on ? ` · ${t("left", { date: formatDate(member.left_on, locale) })}` : ""}
        </p>
      </div>
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
        {roles.canManage ? (
          <Button variant="primary" onPress={() => setAdding(true)}>
            {t("add.button")}
          </Button>
        ) : null}
      </header>

      {!roles.canManage ? <p className="text-sm text-muted">{t("readOnly")}</p> : null}

      {roles.canManage ? (
        <Modal isOpen={adding} onOpenChange={setAdding}>
          <Modal.Backdrop>
            <Modal.Container placement="center" size="md">
              <Modal.Dialog aria-label={t("add.title")} className="max-h-[92dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {adding ? <AddMemberForm onDone={() => setAdding(false)} /> : null}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}

      <div role="group" aria-label={t("filter.label")} className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "primary" : "secondary"} aria-pressed={filter === f} className="min-h-9" onPress={() => setFilter(f)}>
            {t(`filter.${f}`)}
          </Button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {shown.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </ul>
      )}

      {roles.canManage ? <InvitesPanel members={all} /> : null}
      {roles.canAdmin ? <RolesPanel members={all} /> : null}
    </div>
  );
}
