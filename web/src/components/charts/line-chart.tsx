"use client";

import { useEffect, useRef, useState } from "react";
import { labelStep, niceTicks } from "./scale";
import { ChartTooltip } from "./tooltip";

export interface LinePoint { key: string | number; label: string; value: number | null; valueLabel: string; tickLabel?: string }

const TOP = 12;
const BOTTOM = 30;
const PAD_X = 10;

/** Measured width of an element (keeps the fallback where layout is missing, e.g. jsdom). */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const next = Math.round(el.getBoundingClientRect().width);
      if (next > 0) setW(next);
    };
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * One series, 2px line, 8px markers, crosshair + tooltip on hover and keyboard focus.
 * `null` values are gaps (the line breaks, no marker). Width follows the container.
 */
export function LineChart({
  points, formatTick, minStep = 1, ariaLabel, height = 180,
}: { points: LinePoint[]; formatTick: (value: number) => string; minStep?: number; ariaLabel?: string; height?: number }) {
  const [ref, width] = useWidth(320);
  const [active, setActive] = useState<number | null>(null);
  const n = points.length;
  const vals = points.flatMap((p) => (p.value === null ? [] : [p.value]));
  if (n === 0 || vals.length === 0) return null;

  const ticks = niceTicks(Math.min(...vals), Math.max(...vals), { count: 3, minStep });
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const span = hi - lo || 1;
  const left = Math.max(36, Math.max(...ticks.map((t) => formatTick(t).length)) * 6.5 + 14);
  const plotW = Math.max(width - left - 12, 40);
  const plotH = height - TOP - BOTTOM;
  const x = (i: number) => (n === 1 ? left + plotW / 2 : left + PAD_X + (i * (plotW - 2 * PAD_X)) / (n - 1));
  const y = (v: number) => TOP + plotH - ((v - lo) / span) * plotH;

  const segments: string[] = [];
  let cur: string[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur.length) segments.push(cur.join(" "));
      cur = [];
    } else cur.push(`${cur.length ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`);
  });
  if (cur.length) segments.push(cur.join(" "));

  const step = labelStep(n, Math.floor(plotW / 90));
  const showAllMarkers = n <= 12;
  const nearest = (clientX: number, rect: DOMRect) => {
    const px = clientX - rect.left;
    let best = -1;
    let bestD = Infinity;
    points.forEach((p, i) => {
      if (p.value === null) return;
      const d = Math.abs(x(i) - px);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best < 0 ? null : best;
  };
  const a = active !== null ? points[active] : null;
  const ax = active !== null ? x(active) : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} role="group" aria-label={ariaLabel} className="block overflow-visible" onPointerLeave={(e) => { if (e.pointerType !== "touch") setActive(null); }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-muted text-[11px] tabular-nums">{formatTick(t)}</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % step === 0 ? (
            <text
              key={p.key}
              x={x(i)}
              y={height - 8}
              textAnchor={x(i) - 40 < 0 ? "start" : x(i) + 40 > width ? "end" : "middle"}
              className="fill-muted text-[11px]"
            >
              {p.tickLabel ?? p.label}
            </text>
          ) : null,
        )}
        {a && a.value !== null ? <line x1={ax} x2={ax} y1={TOP} y2={TOP + plotH} stroke="var(--muted)" strokeWidth={1} opacity={0.5} /> : null}
        <rect
          x={left} y={TOP} width={plotW} height={plotH} fill="transparent"
          // pan-y: a horizontal drag scrubs the line, a vertical swipe still scrolls the page.
          style={{ touchAction: "pan-y" }}
          onPointerDown={(e) => setActive(nearest(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect()))}
          onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect()))}
        />
        {segments.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
        ))}
        {points.map((p, i) =>
          p.value === null ? null : (
            <g key={p.key}>
              {showAllMarkers || i === active || i === n - 1 ? (
                <circle cx={x(i)} cy={y(p.value)} r={active === i ? 5 : 4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} pointerEvents="none" />
              ) : null}
              <circle
                cx={x(i)} cy={y(p.value)} r={12} fill="transparent" tabIndex={0} role="img"
                aria-label={`${p.label}: ${p.valueLabel}`} data-testid={`pt-${p.key}`}
                className="outline-none focus-visible:stroke-focus focus-visible:[stroke-width:2px]"
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((c) => (c === i ? null : c))}
              />
            </g>
          ),
        )}
      </svg>
      {a && a.value !== null ? (
        <ChartTooltip
          label={a.label}
          value={a.valueLabel}
          style={{ top: 0, left: Math.min(Math.max(ax, 50), Math.max(width - 50, 50)), transform: "translateX(-50%)" }}
        />
      ) : null}
    </div>
  );
}
