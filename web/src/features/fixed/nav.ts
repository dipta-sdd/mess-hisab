import type { NavItem } from "@/features/types";

export const fixedNav: NavItem = {
  key: "fixed",
  href: (messId) => `/${messId}/admin/fixed`,
  labelKey: "fixed.nav",
  icon: "settings",
  place: "admin",
  roles: ["admin", "manager"],
  order: 30,
};
