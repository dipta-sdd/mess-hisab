import type { NavItem } from "@/features/types";

export const monthsNav: NavItem = {
  key: "months",
  href: (messId) => `/${messId}/admin/months`,
  labelKey: "months.nav",
  icon: "months",
  place: "admin",
  roles: ["admin", "manager"],
  order: 70,
};
