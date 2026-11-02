import type { NavItem } from "@/features/types";

export const statementsNav: NavItem = {
  key: "statements",
  href: (messId) => `/${messId}/statements`,
  labelKey: "statements.nav",
  icon: "reports",
  place: "admin",
  roles: ["admin", "manager"],
  order: 60,
};

/** Bottom-bar link to the signed-in member's own statement. */
export const myStatementNav: NavItem = {
  key: "my-statement",
  href: (messId, memberId) => (memberId ? `/${messId}/statements/${memberId}` : `/${messId}/statements`),
  labelKey: "common.nav.myStatement",
  icon: "statement",
  place: "bar",
  order: 45,
};
