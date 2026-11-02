/** Horizontal bar charts that BarList / DivergingBars cannot do: two bars per person, and one stacked bar per person. */

export interface Series { key: string; label: string; className: string }

export function Legend({ series }: { series: Series[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" data-testid="legend">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-2">
          <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm ${s.className}`} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

export interface PairedDatum { key: number; label: string; values: { value: number; valueLabel: string }[] }

/** Two (or more) bars per person on one shared scale. Series colours come from `series` in the same order as `values`. */
export function PairedBars({ items, series, ariaLabel }: { items: PairedDatum[]; series: Series[]; ariaLabel: string }) {
  const max = Math.max(1, ...items.flatMap((i) => i.values.map((v) => v.value)));
  return (
    <div className="flex flex-col gap-4">
      <Legend series={series} />
      <ul aria-label={ariaLabel} className="flex flex-col gap-4">
        {items.map((it) => (
          <li key={it.key} className="flex flex-col gap-1.5" data-testid={`pair-${it.key}`}>
            <span className="text-sm font-medium">{it.label}</span>
            {it.values.map((v, i) => (
              <div key={series[i].key} className="flex items-center gap-3" aria-label={`${series[i].label}: ${v.valueLabel}`}>
                <div className="h-3 flex-1" aria-hidden="true">
                  <div className={`h-3 rounded-e-[4px] ${series[i].className}`} style={{ width: `${Math.max((v.value / max) * 100, v.value > 0 ? 1 : 0)}%` }} />
                </div>
                <span className="w-28 shrink-0 text-end text-sm tabular-nums">{v.valueLabel}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StackedDatum { key: number; label: string; total: number; totalLabel: string; segments: { value: number; valueLabel: string }[] }

/** One bar per person split into segments (same order as `series`), all on one scale so bars are comparable. */
export function StackedBars({ items, series, ariaLabel }: { items: StackedDatum[]; series: Series[]; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((i) => i.segments.reduce((s, x) => s + x.value, 0)));
  return (
    <div className="flex flex-col gap-4">
      <Legend series={series} />
      <ul aria-label={ariaLabel} className="flex flex-col gap-4">
        {items.map((it) => {
          const sum = it.segments.reduce((s, x) => s + x.value, 0);
          return (
            <li key={it.key} className="flex flex-col gap-1.5" data-testid={`stack-${it.key}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 break-words font-medium">{it.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">{it.totalLabel}</span>
              </div>
              <div className="flex h-4 w-full" aria-hidden="true">
                <div className="flex h-4" style={{ width: `${(sum / max) * 100}%` }}>
                  {it.segments.map((seg, i) =>
                    seg.value > 0 ? (
                      <div key={series[i].key} className={`h-4 ${series[i].className} ${i === 0 ? "rounded-s-[4px]" : ""}`} style={{ width: `${(seg.value / sum) * 100}%` }} />
                    ) : null,
                  )}
                </div>
              </div>
              <p className="text-xs text-muted">
                {it.segments.map((seg, i) => (seg.value > 0 ? `${series[i].label} ${seg.valueLabel}` : null)).filter(Boolean).join(" · ")}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
