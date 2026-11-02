import type { NavItem } from "@/features/types";

export const reportsNav: NavItem = {
  key: "reports",
  href: (messId) => `/${messId}/reports`,
  labelKey: "reports.nav",
  icon: "reports",
  roles: ["admin", "manager"],
  order: 65,
};
