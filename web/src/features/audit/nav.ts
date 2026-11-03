import type { NavItem } from "@/features/types";

export const auditNav: NavItem = {
  key: "audit",
  href: (messId) => `/${messId}/admin/audit`,
  labelKey: "audit.nav",
  icon: "audit",
  place: "admin",
  roles: ["admin", "manager"],
  order: 80,
};
