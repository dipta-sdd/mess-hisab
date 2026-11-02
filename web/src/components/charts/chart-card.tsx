"use client";

import { useId, useState } from "react";

export interface ChartTable { headers: string[]; rows: string[][] }

/**
 * Titled card around one chart, with a "Show as table" switch that swaps the chart for an accessible table
 * of the same numbers. All strings come from the caller (locale-agnostic). `empty` replaces the chart and the switch.
 */
export function ChartCard({
  title, subtitle, table, showTableLabel, hideTableLabel, empty, note, testId, children,
}: {
  title: string;
  subtitle?: string;
  table?: ChartTable;
  showTableLabel: string;
  hideTableLabel: string;
  /** When set, shown instead of the chart (no data). */
  empty?: string;
  /** Short muted note under the chart (e.g. "trend appears after more months"). */
  note?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const [asTable, setAsTable] = useState(false);
  const canToggle = !empty && !!table;
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3" data-testid={testId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="text-lg font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        {canToggle ? (
          <button
            type="button"
            aria-pressed={asTable}
            aria-controls={`${id}-body`}
            onClick={() => setAsTable((v) => !v)}
            className="min-h-11 rounded-lg border border-border px-3 text-sm"
          >
            {asTable ? hideTableLabel : showTableLabel}
          </button>
        ) : null}
      </div>
      <div id={`${id}-body`} className="min-w-0">
        {empty ? (
          <p className="text-muted">{empty}</p>
        ) : asTable && table ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-muted">
                  {table.headers.map((h, i) => (
                    <th key={i} scope="col" className={`p-2 ${i === 0 ? "text-start" : "text-end"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-border">
                    {r.map((c, ci) =>
                      ci === 0 ? (
                        <th key={ci} scope="row" className="p-2 text-start font-medium">{c}</th>
                      ) : (
                        <td key={ci} className="p-2 text-end">{c}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
      {note && !empty ? <p className="text-sm text-muted">{note}</p> : null}
    </section>
  );
}
