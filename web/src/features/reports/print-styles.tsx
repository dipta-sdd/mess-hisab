/**
 * Print rules for the monthly report. Rendered as a <style> tag only while the report page is mounted, so nothing
 * leaks to other pages. We cannot edit app-shell.tsx, so the shell is hidden by element selectors:
 *   - desktop sidebar:  `aside`
 *   - mobile header:    `header`
 *   - bottom nav:       `nav`
 *   - skip link:        `a[href="#main-content"]`
 * The report itself therefore must not use <header>, <nav> or <aside> elements. If the shell changes its
 * landmarks, update SHELL_SELECTORS. (No ">" combinators: React escapes it inside a <style> text child.)
 */
const SHELL_SELECTORS = ['aside', 'header', 'nav', 'a[href="#main-content"]'];

export const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; color: #111 !important; }
  ${SHELL_SELECTORS.join(",\n  ")} { display: none !important; }
  main { padding: 0 !important; }
  .report-root {
    --background: #fff; --foreground: #111; --surface: #fff; --muted: #555; --border: #cfcfd4;
    --accent: #0f766e; --success: #1a7f45; --danger: #c62828;
    max-width: none !important; padding: 0 !important; gap: 12px !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
    font-size: 11px;
  }
  .report-root button, .report-root select, .report-root [data-print="hide"] { display: none !important; }
  .report-root [data-print="only"] { display: block !important; }
  .report-root section, .report-root tr, .report-root li, .report-root figure { break-inside: avoid; page-break-inside: avoid; }
  .report-root h2 { break-after: avoid; }
  .report-root [data-print="break-before"] { break-before: page; }
  .report-root table { width: 100%; }
  .report-root thead { display: table-header-group; }
  .report-root .overflow-x-auto { overflow: visible !important; }
}
`;

export function ReportPrintStyles() {
  return <style data-testid="report-print-styles">{PRINT_CSS}</style>;
}
