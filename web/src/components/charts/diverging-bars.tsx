"use client";

import { useState } from "react";
import { labelStep, niceTicks } from "./scale";
import { ChartTooltip } from "./tooltip";

export interface DivergingDatum { key: string | number; label: string; value: number; valueLabel: string; tickLabel?: string }

/**
 * Bars around a zero line. positive = var(--success), negative = var(--danger).
 * horizontal: one row per item (label + value on top, bar below) - good for names.
 * vertical: columns over an ordered axis (e.g. months), with a y axis and tooltip on hover/focus.
 */
export function DivergingBars({
  items, orientation = "horizontal", formatTick, minStep = 1, ariaLabel, height = 176,
}: {
  items: DivergingDatum[];
  orientation?: "horizontal" | "vertical";
  /** vertical only: y-axis tick text. */
  formatTick?: (value: number) => string;
  minStep?: number;
  ariaLabel?: string;
  height?: number;
}) {
  if (items.length === 0) return null;
  return orientation === "horizontal" ? (
    <HorizontalRows items={items} ariaLabel={ariaLabel} />
  ) : (
    <VerticalColumns items={items} formatTick={formatTick} minStep={minStep} ariaLabel={ariaLabel} height={height} tone="diverging" />
  );
}

const toneClass = (v: number) => (v < 0 ? "bg-danger" : "bg-success");

function HorizontalRows({ items, ariaLabel }: { items: DivergingDatum[]; ariaLabel?: string }) {
  const maxPos = Math.max(0, ...items.map((i) => i.value));
  const maxNeg = Math.max(0, ...items.map((i) => -i.value));
  const span = maxPos + maxNeg || 1;
  const zero = (maxNeg / span) * 100;
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-3">
      {items.map((it) => {
        const w = Math.max((Math.abs(it.value) / span) * 100, 1);
        return (
          <li
            key={it.key}
            tabIndex={0}
            className="group flex flex-col gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus"
            data-testid={`dbar-${it.key}`}
          >
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-foreground">{it.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{it.valueLabel}</span>
            </div>
            <div className="relative h-2 w-full" aria-hidden="true">
              <div className="absolute -inset-y-[3px] w-px bg-border" style={{ insetInlineStart: `${zero}%` }} />
              {it.value !== 0 ? (
                <div
                  className={`absolute top-0 h-2 transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80 ${toneClass(it.value)} ${
                    it.value < 0 ? "rounded-s-[4px]" : "rounded-e-[4px]"
                  }`}
                  style={
                    it.value < 0
                      ? { insetInlineEnd: `${100 - zero}%`, width: `${w}%` }
                      : { insetInlineStart: `${zero}%`, width: `${w}%` }
                  }
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Shared by ColumnChart (tone "accent": columns up from 0) and vertical DivergingBars. */
export function VerticalColumns({
  items, formatTick, minStep, ariaLabel, height, tone,
}: {
  items: DivergingDatum[];
  formatTick?: (value: number) => string;
  minStep: number;
  ariaLabel?: string;
  height: number;
  tone: "accent" | "diverging";
}) {
  const [active, setActive] = useState<number | null>(null);
  const n = items.length;
  const lo0 = Math.min(0, ...items.map((i) => i.value));
  const hi0 = Math.max(0, ...items.map((i) => i.value));
  const ticks = niceTicks(lo0, hi0, { count: 4, minStep });
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const zero = pct(0);
  const step = labelStep(n, 5);
  const fmt = formatTick ?? String;
  const activeItem = active !== null ? items[active] : null;
  const edge = active === null ? "" : active < n / 4 ? "left-0" : active >= (3 * n) / 4 ? "right-0" : "";
  const tipStyle: React.CSSProperties | undefined =
    active === null || edge ? undefined : { left: `${((active + 0.5) / n) * 100}%`, transform: "translateX(-50%)" };

  return (
    <div className="flex gap-2" role="group" aria-label={ariaLabel}>
      <div className="relative w-14 shrink-0 text-xs text-muted" style={{ height }} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2 whitespace-nowrap tabular-nums" style={{ bottom: `${pct(t)}%` }}>{fmt(t)}</span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className={`absolute inset-x-0 h-px ${t === 0 ? "bg-muted/50" : "bg-border"}`} style={{ bottom: `${pct(t)}%` }} aria-hidden="true" />
          ))}
          <div className="absolute inset-0 flex">
            {items.map((it, i) => {
              const h = (Math.abs(it.value) / span) * 100;
              const color = tone === "accent" ? "bg-accent" : toneClass(it.value);
              return (
                <div
                  key={it.key}
                  role="img"
                  tabIndex={0}
                  aria-label={`${it.label}: ${it.valueLabel}`}
                  data-testid={`col-${it.key}`}
                  onPointerEnter={() => setActive(i)}
                  onPointerLeave={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  className={`relative h-full flex-1 outline-none focus-visible:ring-2 focus-visible:ring-focus ${active === i ? "bg-foreground/5" : ""}`}
                >
                  {it.value !== 0 ? (
                    <div
                      className={`absolute left-1/2 w-[min(60%,24px)] -translate-x-1/2 ${color} ${it.value < 0 ? "rounded-b-[4px]" : "rounded-t-[4px]"}`}
                      style={
                        it.value < 0
                          ? { top: `${100 - zero}%`, height: `max(${h}%, 2px)` }
                          : { bottom: `${zero}%`, height: `max(${h}%, 2px)` }
                      }
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
          {activeItem ? <ChartTooltip label={activeItem.label} value={activeItem.valueLabel} className={`top-0 ${edge}`} style={tipStyle} /> : null}
        </div>
        <div className="mt-1 flex text-xs text-muted" aria-hidden="true">
          {items.map((it, i) => (
            <div key={it.key} className="relative h-8 flex-1">
              {i % step === 0 ? (
                <span className="absolute left-1/2 top-0 -translate-x-1/2 text-center leading-tight" style={{ width: `${step * 100}%` }}>
                  {it.tickLabel ?? it.label}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
