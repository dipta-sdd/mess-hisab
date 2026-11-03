"use client";

import { MonthStepper } from "@/components/ui/month-stepper";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ExportButton, StatementExport } from "@/features/export";
import type { AppLocale } from "@/i18n/config";
import type { Month } from "@/lib/api/contract";
import { formatBalance, formatDate, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useMembers, useMessInfo, useMonths } from "./api";
import { AdjustmentsPanel } from "./adjustments-panel";
import type { BlockContext } from "./blocks";
import { ClosePanel } from "./close-panel";
import { formatMonthLabel } from "@/lib/format/date";
import { DoesntPayPanel } from "./doesnt-pay-panel";
import { RecoverablesPanel } from "./recoverables-panel";
import { ReopenPanel } from "./reopen-panel";
import { Banner, Notice } from "./ui";

export function MonthsPage() {
  const { messId } = useMess();
  const t = useTranslations("months");
  const tc = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const messQ = useMessInfo(messId);
  const monthsQ = useMonths(messId);
  const membersQ = useMembers(messId);

  const [picked, setPicked] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const months = monthsQ.data ?? [];
  const members = membersQ.data ?? [];
  const isManager = Boolean(messQ.data?.me.is_manager) && !messQ.data?.me.archived_at;
  const roundingMode = messQ.data?.mess.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, roundingMode);

  // Default: the oldest open month (the one to close first), else the newest.
  const oldestOpen = [...months].reverse().find((m) => m.status === "open");
  const selected: Month | undefined = months.find((m) => m.id === picked) ?? oldestOpen ?? months[0];
  const latestClosed = months.find((m) => m.status === "closed");

  const nameOf = (id: number) => members.find((m) => m.id === id)?.display_name ?? t("unknownMember");
  const ctx: BlockContext = {
    messId,
    money,
    balance: (paisa) => formatBalance(paisa, locale, roundingMode, tc),
    nameOf,
    monthLabelOf: (id) => {
      const m = months.find((x) => x.id === id);
      return m ? formatMonthLabel(m.starts_on, locale) : `#${id}`;
    },
  };

  const loading = messQ.isPending || monthsQ.isPending;
  const failed = messQ.isError || monthsQ.isError;

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      {notice ? <Notice>{notice}</Notice> : null}

      {failed ? (
        <Banner>{t("errors.loadFailed")}</Banner>
      ) : loading ? (
        <p role="status" className="text-muted">{t("loading")}</p>
      ) : months.length === 0 ? (
        <p className="text-muted">{t("list.empty")}</p>
      ) : (
        <>
          <nav aria-label={t("list.label")}>
            <MonthStepper
              months={months}
              selectedId={selected?.id ?? null}
              onChange={(id) => { setPicked(id); setNotice(null); }}
              labels={{ prev: t("stepper.prev"), next: t("stepper.next"), open: t("status.open"), closed: t("status.closed") }}
            />
          </nav>

          {selected ? (
            <section aria-labelledby="month-title" className="flex flex-col gap-6" key={selected.id}>
              <div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
                <h2 id="month-title" className="text-xl font-semibold">{formatMonthLabel(selected.starts_on, locale)}</h2>
                <p className="text-sm text-muted">
                  {formatDate(selected.starts_on, locale)} – {formatDate(selected.ends_on, locale)} · {selected.status === "open" ? t("status.open") : t("status.closed")}
                </p>
                {selected.closed_at ? <p className="text-sm text-muted">{t("closedOn", { date: formatDate(selected.closed_at, locale) })}</p> : null}
                {selected.status === "closed" && selected.zero_meal_resolution ? (
                  <p className="text-sm text-muted">{t(`zeroMealResolution.${selected.zero_meal_resolution}`)}</p>
                ) : null}
              </div>

              <section aria-labelledby="export-title" className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
                <h3 id="export-title" className="text-lg font-semibold">{t("export.title")}</h3>
                <ExportButton type="month" monthId={selected.id} />
                <StatementExport monthId={selected.id} members={members} />
              </section>

              {isManager && selected.status === "open" ? (
                <ClosePanel
                  messId={messId}
                  month={selected}
                  ctx={ctx}
                  onClosed={() => { setNotice(t("close.done", { month: formatMonthLabel(selected.starts_on, locale) })); }}
                />
              ) : null}

              {isManager && selected.status === "closed" ? (
                selected.id === latestClosed?.id ? (
                  <ReopenPanel
                    messId={messId}
                    month={selected}
                    ctx={ctx}
                    onReopened={() => { setNotice(t("reopen.done", { month: formatMonthLabel(selected.starts_on, locale) })); }}
                  />
                ) : (
                  <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">{t("reopen.onlyLatest")}</p>
                )
              ) : null}

              {selected.status === "open" ? (
                <DoesntPayPanel messId={messId} month={selected} isManager={isManager} money={money} nameOf={nameOf} />
              ) : null}
            </section>
          ) : null}

          <RecoverablesPanel messId={messId} isManager={isManager} members={members} money={money} />
          <AdjustmentsPanel messId={messId} isManager={isManager} members={members} money={money} />
        </>
      )}
    </div>
  );
}
