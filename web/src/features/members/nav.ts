import type { NavItem } from "../types";

export const nav: NavItem[] = [
  { key: "members", href: (messId) => `/${messId}/members`, labelKey: "members.nav", icon: "members", order: 50 },
];
