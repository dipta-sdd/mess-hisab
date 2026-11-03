import type { NavItem } from "@/features/types";

const staff: NavItem["roles"] = ["admin", "manager"];

export const adminNav: NavItem[] = [
  { key: "admin-dashboard", href: (m) => `/${m}/admin`, labelKey: "common.nav.adminDashboard", icon: "dashboard", roles: staff, place: "admin", order: 5 },
  { key: "admin-meals", href: (m) => `/${m}/admin/meals`, labelKey: "common.nav.adminMeals", icon: "meals", roles: staff, place: "admin", order: 6 },
  { key: "admin-expenses", href: (m) => `/${m}/admin/expenses`, labelKey: "common.nav.adminExpenses", icon: "expenses", roles: staff, place: "admin", order: 7 },
  { key: "admin-payments", href: (m) => `/${m}/admin/payments`, labelKey: "common.nav.adminPayments", icon: "payments", roles: staff, place: "admin", order: 8 },
];
