export interface BarListItem { key: string | number; label: string; value: number; valueLabel: string }

/** Horizontal bars, one per row: label and value on top, a thin bar below. Pass items already sorted. One hue (accent). */
export function BarList({ items, ariaLabel }: { items: BarListItem[]; ariaLabel?: string }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-3">
      {items.map((it) => (
        <li
          key={it.key}
          tabIndex={0}
          className="group flex flex-col gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus"
          data-testid={`bar-${it.key}`}
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words text-foreground">{it.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{it.valueLabel}</span>
          </div>
          <div className="h-2 w-full" aria-hidden="true">
            <div
              className="h-2 rounded-e-[4px] bg-accent transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
              style={{ width: `${Math.max((it.value / max) * 100, it.value > 0 ? 1 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
