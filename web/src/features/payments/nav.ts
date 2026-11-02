import type { NavItem } from "@/features/types";

export const paymentsNav: NavItem = {
  key: "payments",
  href: (messId) => `/${messId}/payments`,
  labelKey: "payments.nav",
  icon: "payments",
  place: "bar",
  order: 40,
};
