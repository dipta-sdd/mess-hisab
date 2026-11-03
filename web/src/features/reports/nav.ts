import type { NavItem } from "@/features/types";

export const reportsNav: NavItem = {
  key: "reports",
  href: (messId) => `/${messId}/admin/reports`,
  labelKey: "reports.nav",
  icon: "reports",
  roles: ["admin", "manager"],
  place: "admin",
  order: 65,
};
