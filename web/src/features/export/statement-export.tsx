"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { ExportButton } from "./export-button";

const fieldClass =
  "w-full min-h-11 rounded-lg border border-default-300 bg-background px-3 py-2 text-base text-foreground focus:outline-2 focus:outline-offset-1 focus:outline-accent";

/** Member picker + "Export statement" for one month. */
export function StatementExport({ monthId, members, pollMs }: { monthId: number; members: { id: number; display_name: string }[]; pollMs?: number }) {
  const t = useTranslations("export");
  const id = useId();
  const [memberId, setMemberId] = useState<number | undefined>(undefined);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">{t("memberLabel")}</label>
      <select
        id={id}
        className={fieldClass}
        value={memberId ?? ""}
        onChange={(e) => setMemberId(e.target.value === "" ? undefined : Number(e.target.value))}
      >
        <option value="">{t("memberPlaceholder")}</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>{m.display_name}</option>
        ))}
      </select>
      {/* key: switching member starts a fresh export instead of showing the previous member's link */}
      <ExportButton key={`${monthId}-${memberId ?? "none"}`} type="statement" monthId={monthId} memberId={memberId} pollMs={pollMs} />
    </div>
  );
}
