import type { NavItem } from "@/features/types";

export const expensesNav: NavItem = {
  key: "expenses",
  href: (messId) => `/${messId}/expenses`,
  labelKey: "expenses.nav",
  icon: "expenses",
  order: 20,
};
