import type { NavItem } from "@/features/types";

export const mealsNav: NavItem = {
  key: "meals",
  href: (messId) => `/${messId}/meals`,
  labelKey: "meals.nav",
  icon: "meals",
  place: "bar",
  order: 20,
};
