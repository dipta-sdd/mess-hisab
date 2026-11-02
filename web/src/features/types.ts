export type MessRole = "admin" | "manager" | "member";

export interface NavItem {
  key: string;
  /** Route for the given mess, e.g. (id) => `/${id}/expenses`. */
  href: (messId: number) => string;
  /** next-intl key, "<namespace>.<key>". */
  labelKey: string;
  /** Icon name the shell maps to a component. */
  icon: string;
  /** Only shown to these roles; omitted = everyone. */
  roles?: MessRole[];
  order: number;
}
