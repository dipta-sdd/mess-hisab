// Lead-owned. Each feature exports `nav` from src/features/<feature>/nav.ts; the lead adds one line here when merging.
import type { NavItem } from "./types";
import { adminNav } from "./admin-nav";
import { auditNav } from "./audit/nav";
import { dashboardNav } from "./dashboard/nav";
import { expensesNav } from "./expenses/nav";
import { fixedNav } from "./fixed/nav";
import { mealsNav } from "./meals/nav";
import { monthsNav } from "./months/nav";
import { nav as membersNav } from "./members/nav";
import { paymentsNav } from "./payments/nav";
import { nav as settingsNav } from "./settings/nav";
import { myStatementNav, statementsNav } from "./statements/nav";

const items: NavItem[] = [
  ...adminNav,
  dashboardNav,
  statementsNav,
  myStatementNav,
  mealsNav,
  fixedNav,
  expensesNav,
  paymentsNav,
  ...membersNav,
  ...settingsNav,
  monthsNav,
  auditNav,
  // dashboardNav, expensesNav, ... (one NavItem per feature)
];

export const navRegistry: NavItem[] = [...items].sort((a, b) => a.order - b.order);
