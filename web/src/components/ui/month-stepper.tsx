"use client";

import { Button } from "@heroui/react";
import { useLocale } from "next-intl";
import type { AppLocale } from "@/i18n/config";
import { formatMonthLabel } from "@/lib/format";

export type StepperMonth = { id: number; starts_on: string; status: string };

/** ‹ Month › stepper. `months` must be newest first, so "previous" is the next item. */
export function MonthStepper({
  months,
  selectedId,
  onChange,
  labels,
}: {
  months: StepperMonth[];
  selectedId: number | null;
  onChange: (id: number) => void;
  labels: { prev: string; next: string; open: string; closed: string };
}) {
  const locale = useLocale() as AppLocale;
  const at = months.findIndex((m) => m.id === selectedId);
  const month = at >= 0 ? months[at] : undefined;
  const older = at >= 0 ? months[at + 1] : undefined;
  const newer = at > 0 ? months[at - 1] : undefined;

  return (
    <div className="flex items-center gap-1" data-testid="month-stepper">
      <Button isIconOnly variant="ghost" aria-label={labels.prev} isDisabled={!older} onPress={() => older && onChange(older.id)} className="size-11">
        <span aria-hidden="true">‹</span>
      </Button>
      <div className="min-w-36 text-center">
        <p className="font-semibold">{month ? formatMonthLabel(month.starts_on, locale) : "…"}</p>
        {month ? <p className="text-sm text-muted">{month.status === "open" ? labels.open : labels.closed}</p> : null}
      </div>
      <Button isIconOnly variant="ghost" aria-label={labels.next} isDisabled={!newer} onPress={() => newer && onChange(newer.id)} className="size-11">
        <span aria-hidden="true">›</span>
      </Button>
    </div>
  );
}
