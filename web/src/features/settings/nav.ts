import type { NavItem } from "../types";

export const nav: NavItem[] = [
  { key: "settings", href: (messId) => `/${messId}/settings`, labelKey: "settings.nav", icon: "settings", order: 90 },
];
