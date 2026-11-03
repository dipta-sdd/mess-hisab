"use client";

import { Button, Card } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Member } from "@/lib/api/contract";
import { ErrorAlert, SuccessAlert, useApiErrorText } from "@/features/mess/ui/errors";
import { SelectField } from "@/features/mess/ui/fields";
import { useMess } from "@/lib/mess/mess-context";
import { useAssignManager, useTransferAdmin } from "../api";

function RoleRow({
  kind,
  candidates,
  current,
}: {
  kind: "admin" | "manager";
  candidates: Member[];
  current: Member | undefined;
}) {
  const t = useTranslations("members");
  const { messId } = useMess();
  const transfer = useTransferAdmin(messId);
  const assign = useAssignManager(messId);
  const mutation = kind === "admin" ? transfer : assign;
  const errorText = useApiErrorText();
  const [selected, setSelected] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const options = candidates.filter((m) => m.id !== current?.id);

  const run = async () => {
    setError(null);
    setDone(false);
    try {
      await mutation.mutateAsync(Number(selected));
      setSelected("");
      setConfirming(false);
      setDone(true);
    } catch (err) {
      setError(errorText(err));
      setConfirming(false);
    }
  };

  const chosen = options.find((m) => String(m.id) === selected);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        {t(`roles.${kind}Current`, { name: current?.display_name ?? t("roles.none") })}
      </p>
      <ErrorAlert message={error} />
      {done ? <SuccessAlert message={t(`roles.${kind}Done`)} /> : null}
      <SelectField
        label={t(`roles.${kind}Pick`)}
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setConfirming(false);
          setDone(false);
        }}
      >
        <option value="">{t("roles.choose")}</option>
        {options.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </SelectField>
      {options.length === 0 ? <p className="text-sm text-muted">{t("roles.noCandidates")}</p> : null}
      {confirming && chosen ? (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t(`roles.${kind}ConfirmGroup`)}>
          <span className="text-sm">{t(`roles.${kind}Confirm`, { name: chosen.display_name })}</span>
          <Button variant="primary" size="sm" isPending={mutation.isPending} onPress={run}>
            {t("roles.yes")}
          </Button>
          <Button variant="ghost" size="sm" onPress={() => setConfirming(false)}>
            {t("cancel")}
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="outline" isDisabled={!selected} onPress={() => (kind === "admin" ? setConfirming(true) : run())}>
            {t(`roles.${kind}Submit`)}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Admin only: hand the admin role over, or pick who is the manager. Only people with an account qualify. */
export function RolesPanel({ members }: { members: Member[] }) {
  const t = useTranslations("members");
  const candidates = members.filter((m) => m.has_account && !m.archived_at);
  const admin = members.find((m) => m.is_admin);
  const manager = members.find((m) => m.is_manager);

  return (
    <Card.Root>
      <Card.Header>
        <Card.Title className="text-lg font-semibold">{t("roles.title")}</Card.Title>
        <Card.Description>{t("roles.hint")}</Card.Description>
      </Card.Header>
      <Card.Content className="grid gap-6 md:grid-cols-2">
        <RoleRow kind="manager" candidates={candidates} current={manager} />
        <RoleRow kind="admin" candidates={candidates} current={admin} />
      </Card.Content>
    </Card.Root>
  );
}
