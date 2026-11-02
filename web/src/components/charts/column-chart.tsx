"use client";

import { VerticalColumns, type DivergingDatum } from "./diverging-bars";

export type ColumnDatum = DivergingDatum;

/** One series of vertical columns from a zero baseline, single hue (accent). */
export function ColumnChart({
  items, formatTick, minStep = 1, ariaLabel, height = 176,
}: { items: ColumnDatum[]; formatTick?: (value: number) => string; minStep?: number; ariaLabel?: string; height?: number }) {
  if (items.length === 0) return null;
  return <VerticalColumns items={items} formatTick={formatTick} minStep={minStep} ariaLabel={ariaLabel} height={height} tone="accent" />;
}
