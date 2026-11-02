import type { NavItem } from "@/features/types";

export const dashboardNav: NavItem = {
  key: "dashboard",
  href: (messId) => `/${messId}`,
  labelKey: "dashboard.nav",
  icon: "dashboard",
  order: 10,
};
