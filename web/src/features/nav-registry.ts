// Lead-owned. Each feature exports `nav` from src/features/<feature>/nav.ts; the lead adds one line here when merging.
import type { NavItem } from "./types";
import { expensesNav } from "./expenses/nav";
import { nav as membersNav } from "./members/nav";
import { paymentsNav } from "./payments/nav";
import { nav as settingsNav } from "./settings/nav";

const items: NavItem[] = [
  expensesNav,
  paymentsNav,
  ...membersNav,
  ...settingsNav,
  // dashboardNav, expensesNav, ... (one NavItem per feature)
];

export const navRegistry: NavItem[] = [...items].sort((a, b) => a.order - b.order);
