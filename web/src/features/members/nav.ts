import type { NavItem } from "../types";

export const nav: NavItem[] = [
  { key: "members", href: (messId) => `/${messId}/admin/members`, labelKey: "members.nav", icon: "members", place: "admin", roles: ["admin", "manager"], order: 50 },
];
