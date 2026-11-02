const PATHS: Record<string, string> = {
  dashboard: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  expenses: "M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6",
  meals: "M7 3v8a2 2 0 002 2v8M11 3v8M15 3c-2 2-2 6 0 8v10",
  payments: "M3 7h18v10H3zM3 11h18M7 15h3",
  members: "M16 19v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 11a3 3 0 100-6 3 3 0 000 6zM20 19v-1a4 4 0 00-3-3.9",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
  months: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  audit: "M9 4h6l4 4v12H5V4h4zM8 13h8M8 17h5",
  reports: "M5 20V10M12 20V4M19 20v-7",
  profile: "M20 21v-1a5 5 0 00-5-5H9a5 5 0 00-5 5v1M12 11a4 4 0 100-8 4 4 0 000 8z",
  logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
};
const FALLBACK = "M12 6a6 6 0 100 12 6 6 0 000-12z";

/** Decorative icon by NavItem.icon name; unknown names get a neutral dot. */
export function NavIcon({ name, className = "size-5" }: { name: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={PATHS[name] ?? FALLBACK} />
    </svg>
  );
}
