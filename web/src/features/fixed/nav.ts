import type { NavItem } from "@/features/types";

export const fixedNav: NavItem = {
  key: "fixed",
  href: (messId) => `/${messId}/fixed`,
  labelKey: "fixed.nav",
  icon: "settings",
  order: 30,
};
