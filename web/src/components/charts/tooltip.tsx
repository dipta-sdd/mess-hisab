/** Hover/focus readout: the value leads (strong), the label follows (muted). Text is React text nodes, never HTML. */
export function ChartTooltip({
  label, value, className = "", style,
}: { label: string; value: string; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      role="tooltip"
      style={style}
      className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-md ${className}`}
    >
      <div className="font-semibold tabular-nums text-foreground">{value}</div>
      <div className="text-muted">{label}</div>
    </div>
  );
}
