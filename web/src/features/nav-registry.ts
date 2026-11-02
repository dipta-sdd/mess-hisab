// Lead-owned. Each feature exports `nav` from src/features/<feature>/nav.ts; the lead adds one line here when merging.
import type { NavItem } from "./types";
import { auditNav } from "./audit/nav";
import { dashboardNav } from "./dashboard/nav";
import { expensesNav } from "./expenses/nav";
import { fixedNav } from "./fixed/nav";
import { mealsNav } from "./meals/nav";
import { monthsNav } from "./months/nav";
import { nav as membersNav } from "./members/nav";
import { paymentsNav } from "./payments/nav";
import { reportsNav } from "./reports/nav";
import { nav as settingsNav } from "./settings/nav";
import { statementsNav } from "./statements/nav";

const items: NavItem[] = [
  dashboardNav,
  statementsNav,
  mealsNav,
  fixedNav,
  expensesNav,
  paymentsNav,
  ...membersNav,
  ...settingsNav,
  monthsNav,
  reportsNav,
  auditNav,
  // dashboardNav, expensesNav, ... (one NavItem per feature)
];

export const navRegistry: NavItem[] = [...items].sort((a, b) => a.order - b.order);
