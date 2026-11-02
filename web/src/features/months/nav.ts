import type { NavItem } from "@/features/types";

export const monthsNav: NavItem = {
  key: "months",
  href: (messId) => `/${messId}/months`,
  labelKey: "months.nav",
  icon: "months",
  order: 70,
};
