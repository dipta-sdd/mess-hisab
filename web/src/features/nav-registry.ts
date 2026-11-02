// Lead-owned. Each feature exports `nav` from src/features/<feature>/nav.ts; the lead adds one line here when merging.
import type { NavItem } from "./types";

const items: NavItem[] = [
  // ...dashboardNav, ...expensesNav,
];

export const navRegistry: NavItem[] = [...items].sort((a, b) => a.order - b.order);
