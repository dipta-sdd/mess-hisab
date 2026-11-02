import type { NavItem } from "@/features/types";

export const statementsNav: NavItem = {
  key: "statements",
  href: (messId) => `/${messId}/statements`,
  labelKey: "statements.nav",
  icon: "reports",
  order: 60,
};
