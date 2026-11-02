import type { Membership } from "@/lib/api/contract";
import type { MessRole, NavItem } from "@/features/types";

/** Roles the current membership holds. Everyone in a mess is a "member". */
export function rolesOf(membership: Pick<Membership, "is_admin" | "is_manager"> | undefined): Set<MessRole> {
  const roles = new Set<MessRole>();
  if (!membership) return roles;
  roles.add("member");
  if (membership.is_admin) roles.add("admin");
  if (membership.is_manager) roles.add("manager");
  return roles;
}

/**
 * Items visible to the given roles, sorted by `order`. Items without `roles` are visible to
 * everyone (also while roles are still unknown); role-restricted items need a matching role.
 */
export function visibleNavItems(items: readonly NavItem[], roles: ReadonlySet<MessRole>): NavItem[] {
  return items
    .filter((item) => !item.roles || item.roles.some((r) => roles.has(r)))
    .sort((a, b) => a.order - b.order);
}
