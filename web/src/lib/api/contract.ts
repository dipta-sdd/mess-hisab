// Lead-owned mirror of docs/CONTRACT.md §1 and §6. Money = integer paisa, meals = integer centi-meals.
// Shapes are checked against docs/contract-fixtures/*.json (web: contract.test.ts, api: expectContractShape()).

export const GROUPS = ["fixed", "meals"] as const;
export const SPLIT_TYPES = ["equal", "fixed_per_person", "by_meal"] as const;
export const ROUNDING_MODES = ["whole_taka", "round_up", "two_decimals"] as const;
export const MEAL_TRACKINGS = ["off", "daily_number", "bld_ticks", "month_total"] as const;
export const MEAL_ENTRY_BY = ["manager", "self"] as const;
export const MONTH_STATUSES = ["open", "closed"] as const;
export const ZERO_MEAL_RESOLUTIONS = ["split_equal", "carry"] as const;
export const PAID_BY = ["member", "cash"] as const;
export const EXPENSE_STATUSES = ["pending", "approved", "rejected"] as const;
export const LEDGER_TYPES = [
  "opening", "charge", "rounding", "adjustment", "doesnt_pay_out", "doesnt_pay_in", "recoverable_repay", "final_payout",
] as const;
export const DOESNT_PAY_MODES = ["equal", "by_meals", "manual"] as const;
export const RECOVERABLE_STATUSES = ["pending", "open", "settled", "undone"] as const;
export const EXPORT_STATUSES = ["queued", "running", "done", "failed"] as const;
export const LOCALES = ["en", "bn"] as const;

export type Group = (typeof GROUPS)[number];
export type SplitType = (typeof SPLIT_TYPES)[number];
export type RoundingMode = (typeof ROUNDING_MODES)[number];
export type MealTracking = (typeof MEAL_TRACKINGS)[number];
export type MealEntryBy = (typeof MEAL_ENTRY_BY)[number];
export type MonthStatus = (typeof MONTH_STATUSES)[number];
export type ZeroMealResolution = (typeof ZERO_MEAL_RESOLUTIONS)[number];
export type PaidBy = (typeof PAID_BY)[number];
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];
export type LedgerType = (typeof LEDGER_TYPES)[number];
export type DoesntPayMode = (typeof DOESNT_PAY_MODES)[number];
export type RecoverableStatus = (typeof RECOVERABLE_STATUSES)[number];
export type ExportStatus = (typeof EXPORT_STATUSES)[number];
export type Locale = (typeof LOCALES)[number];

/** YYYY-MM-DD */
export type DateString = string;
/** ISO-8601 timestamp */
export type DateTimeString = string;

export interface User { id: number; name: string; email: string; locale: Locale; has_password: boolean; has_google: boolean }
export interface Membership { mess_id: number; mess_name: string; member_id: number; is_admin: boolean; is_manager: boolean; archived: boolean }
export interface Mess {
  id: number; name: string; currency: string; month_start_day: number;
  admin_member_id: number | null; manager_member_id: number | null; approval_required: boolean;
  rounding_mode: RoundingMode; meal_tracking: MealTracking; meal_entry_by: MealEntryBy;
  breakfast_weight_centi: number; lunch_weight_centi: number; dinner_weight_centi: number;
  min_meals_enabled: boolean; min_meals_centi: number | null; min_payable_enabled: boolean; min_payable_paisa: number | null;
  deposit_paisa: number; fixed_due_day_offset: number; deposit_due_day_offset: number;
}
export interface Member {
  id: number; display_name: string; user_id: number | null; has_account: boolean; is_admin: boolean; is_manager: boolean;
  joined_on: DateString; left_on: DateString | null; archived_at: DateTimeString | null;
}
export interface Invite { id: number; token: string; url: string; member_id: number | null; expires_at: DateTimeString | null; max_uses: number | null; uses: number; revoked_at: DateTimeString | null }
export interface Month {
  id: number; starts_on: DateString; ends_on: DateString; status: MonthStatus;
  fixed_deadline: DateString | null; deposit_deadline: DateString | null; deposit_paisa: number;
  zero_meal_resolution: ZeroMealResolution | null; closed_at: DateTimeString | null;
}
export interface Category { id: number; group: Group; name: string; split_type: SplitType; sort: number; is_default: boolean; archived_at: DateTimeString | null }
export interface Expense {
  id: number; month_id: number; category_id: number; amount_paisa: number; spent_on: DateString; note: string | null;
  paid_by: PaidBy; paid_by_member_id: number | null; status: ExpenseStatus; is_late: boolean; short_cash_converted: boolean;
  is_self_recorded: boolean; created_by_member_id: number; approved_by_member_id: number | null; created_at: DateTimeString;
}
export interface MealEntry { id: number; member_id: number; entry_date: DateString; breakfast: boolean; lunch: boolean; dinner: boolean; meals_centi: number; guest_meals_centi: number }
export interface Payment { id: number; month_id: number; member_id: number; group: Group; amount_paisa: number; paid_on: DateString; note: string | null; received_by_member_id: number | null }
export interface Bill {
  category_id: number; group: Group; split_type: SplitType; amount_paisa: number;
  overrides: { member_id: number; amount_paisa: number }[]; shares: Record<string, number>;
  unallocated_paisa: number; unallocated_accepted: boolean;
}
/** deposit_paisa null = no per-member override (the month's deposit applies). */
export interface MemberMonthSetting { member_id: number; deposit_paisa: number | null; min_meals_centi: number | null }
export interface Recoverable {
  id: number; month_id: number; debtor_member_id: number; mode: DoesntPayMode; status: RecoverableStatus;
  amount_paisa: number; repaid_paisa: number; shares: { member_id: number; amount_paisa: number; manual_amount_paisa: number | null }[];
}
export interface AuditLog {
  id: number; event: string; member_id: number | null; subject_type: string | null; subject_id: number | null;
  before: Record<string, unknown>; after: Record<string, unknown>; created_at: DateTimeString;
}
export interface Export { id: number; type: string; status: ExportStatus; created_at: DateTimeString; download_url: string | null }

// Task J (live balances). Money integer paisa, meals integer centi; positive = credit, negative = due.
export interface MonthInfo {
  id: number; starts_on: DateString; ends_on: DateString; status: MonthStatus;
  fixed_deadline: DateString | null; deposit_deadline: DateString | null;
}
export interface DashboardRow {
  member_id: number; display_name: string; is_archived: boolean; is_active: boolean;
  meals_centi: number; effective_meals_centi: number; carry_in_paisa: number;
  fixed_bill_paisa: number; meals_bill_paisa: number; paid_paisa: number;
  fixed_balance_paisa: number; meals_balance_paisa: number; balance_paisa: number;
  fixed_outstanding_paisa: number; deposit_required_paisa: number; deposit_outstanding_paisa: number;
  fixed_overdue_days: number; deposit_overdue_days: number;
}
export interface DashboardTotals {
  fixed_bills_paisa: number; fixed_expenses_paisa: number; meals_expenses_paisa: number; food_cost_paisa: number;
  total_meals_centi: number; meal_rate_paisa: number; rounding_extra_paisa: number; uncharged_food_paisa: number;
  zero_meals_unresolved: boolean; charged_paisa: number; paid_paisa: number;
}
/** GET /messes/{mess}/dashboard. cash_pool_paisa is the mess's current pool, whatever month is viewed. */
export interface Dashboard {
  month: MonthInfo; today: DateString; totals: DashboardTotals;
  cash_pool_paisa: number; manager_member_id: number | null; manager_balance_paisa: number;
  members: DashboardRow[];
}
export type StatementLineKind =
  | "carry_in" | "fixed_bill" | "meal_charge" | "rounding" | "charge" | "payment" | "own_pocket_expense"
  | "adjustment" | "doesnt_pay_out" | "doesnt_pay_in" | "recoverable_repay" | "final_payout" | "opening";
export interface StatementLine { kind: StatementLineKind; group: Group | null; label: string; date: DateString | null; amount_paisa: number }
/** GET /messes/{mess}/statements/{member}. Lines sum to total_paisa. */
export interface Statement {
  member: { id: number; display_name: string; is_archived: boolean; is_active: boolean };
  month: MonthInfo; today: DateString; carry_in_paisa: number; lines: StatementLine[];
  fixed_balance_paisa: number; meals_balance_paisa: number; total_paisa: number;
  fixed_outstanding_paisa: number; deposit_required_paisa: number; deposit_outstanding_paisa: number;
  fixed_overdue_days: number; deposit_overdue_days: number;
}
/** GET /messes/{mess}/history → {data: HistoryRow[]}, newest first. */
export interface HistoryRow {
  month_id: number; starts_on: DateString; ends_on: DateString; status: MonthStatus; closed_at: DateTimeString | null;
  fixed_charged_paisa: number; meals_charged_paisa: number; expenses_paisa: number; paid_paisa: number;
  total_meals_centi: number; meal_rate_paisa: number; rounding_extra_paisa: number;
  total_due_paisa: number; total_credit_paisa: number;
}

// Close-check shapes are added here by the lead when task K merges.

export interface ListResponse<T> { data: T[]; meta?: Record<string, unknown> }
export interface ItemResponse<T> { data: T }
export interface ValidationError { message: string; errors: Record<string, string[]> }
export interface DomainError { message: string; code: string }
