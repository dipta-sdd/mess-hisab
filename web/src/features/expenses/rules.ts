import type { Expense, Member, Mess, Month } from "@/lib/api/contract";
import type { ApiError } from "@/lib/api-client";

/**
 * What the UI offers; the server decides for real (403/409 are still handled).
 * Mirrors ExpenseService::assertCanModify:
 *  - manager: any time the expense's month is open (a rejected expense can be deleted, not edited);
 *  - owner: while pending, or (approval off) while the month is open;
 *  - the month must be open for everyone.
 */
export function expenseAbilities(expense: Expense, month: Month | undefined, mess: Mess, me: Member): { canEdit: boolean; canDelete: boolean } {
  if (!month || month.status !== "open") return { canEdit: false, canDelete: false };
  const isManager = me.is_manager;
  const isOwner = expense.created_by_member_id === me.id;
  if (!isManager && !isOwner) return { canEdit: false, canDelete: false };
  if (!isManager && mess.approval_required && expense.status === "approved") return { canEdit: false, canDelete: false };
  return { canEdit: expense.status !== "rejected", canDelete: true };
}

/** Translation key (under `expenses.errors`) for a non-validation API failure. */
export function errorKey(error: ApiError): string {
  if (error.isForbidden) return "forbidden";
  if (error.isConflict) {
    switch (error.code) {
      case "month_closed":
        return "monthClosed";
      case "already_approved":
        return "alreadyApproved";
      case "expense_rejected":
        return "expenseRejected";
      case "not_pending":
        return "notPending";
    }
  }
  return "generic";
}
