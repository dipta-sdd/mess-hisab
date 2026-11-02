import type { DateString, Group, Mess, Month, PaidBy, SplitType } from "@/lib/api/contract";

/**
 * GET /api/messes/{mess}/reports/monthly/{month} (admin, manager). Response is wrapped as `{data: MonthlyReport}`.
 * All money is integer paisa; positive balance = credit, negative = due. Centi-meals: 100 = one meal.
 * 409 `month_not_closed` and 409 `next_month_bills_missing` (+ `next_month_id`, may be null) are domain errors.
 */
export interface MonthlyReport {
  month: Month;
  mess: Mess;
  summary: ReportSummary;
  /** Members active in the month, id ascending. */
  members: ReportMember[];
  /** Approved expenses of the month, by date then id. */
  expenses: ReportExpense[];
  /** Null when the mess does not track meals. */
  meals: ReportMeals | null;
  next_month: ReportNextMonth;
}

export interface ReportSummary {
  member_count: number;
  expense_count: number;
  /** All approved expenses (fixed + meals). */
  expenses_paisa: number;
  fixed_expenses_paisa: number;
  meals_expenses_paisa: number;
  /** Sum of the Fixed bills (before rounding). */
  fixed_bills_paisa: number;
  fixed_charged_paisa: number;
  meals_charged_paisa: number;
  charged_paisa: number;
  /** Payments (deposits) only. */
  paid_paisa: number;
  /** Approved expenses members paid from their own pocket. */
  spent_paisa: number;
  /** Sum of everyone's negative balance, as a positive number. */
  total_due_paisa: number;
  /** Sum of everyone's positive balance. */
  total_credit_paisa: number;
  rounding_extra_paisa: number;
}

export interface ReportMember {
  member_id: number;
  display_name: string;
  /** Balance brought in from earlier months (signed). */
  carry_in_paisa: number;
  fixed_bill_paisa: number;
  meals_bill_paisa: number;
  /** fixed_bill + meals_bill: this month's share (no carry-in). */
  share_paisa: number;
  /** Payments (deposits) only. */
  paid_paisa: number;
  /** Approved expenses this member paid from their own pocket. */
  spent_paisa: number;
  /** Balance after the month; positive = credit, negative = due. */
  balance_paisa: number;
}

export interface ReportExpense {
  id: number;
  spent_on: DateString;
  category_id: number;
  category: string | null;
  group: Group | null;
  amount_paisa: number;
  paid_by: PaidBy;
  paid_by_member_id: number | null;
  /** Null when paid from the shared cash. */
  payer_name: string | null;
  note: string | null;
}

export interface ReportMeals {
  total_meals_centi: number;
  meal_rate_paisa: number;
  food_cost_paisa: number;
  members: { member_id: number; display_name: string; meals_centi: number; effective_meals_centi: number; meals_bill_paisa: number }[];
}

export interface ReportNextMonth {
  month: Month;
  fixed_deadline: DateString | null;
  rows: ReportNextRow[];
}

export interface ReportNextRow {
  member_id: number;
  display_name: string;
  /** Next month's Fixed bill shares (only categories with an amount). */
  by_category: { category_id: number; name: string; split_type: SplitType; amount_paisa: number }[];
  /** Same as "Last month due" in next month's statement (carry-in when negative), else 0. */
  last_month_due_paisa: number;
  /** Carry-in when positive (reduces the total), else 0. */
  last_month_credit_paisa: number;
  /** max(0, Σ by_category + due - credit). */
  total_paisa: number;
}
