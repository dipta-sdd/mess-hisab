import type { QueryClient } from "@tanstack/react-query";

/**
 * Every feature's query keys start with `[feature, messId, ...]`. These are the feature prefixes whose
 * cached data can change after a money write (balances, cash pool, month status/deposit, audit trail).
 */
export const MONEY_QUERY_PREFIXES = ["balance", "payments", "expenses", "meals", "fixed", "months", "settlement", "audit"] as const;

/**
 * Call after ANY mutation that can move money (payment, expense incl. approve/reject, meals, fixed bills,
 * month close/reopen, doesn't-pay, repayment, adjustment, final settlement). One place, so no cache is forgotten.
 * Only active queries refetch; inactive ones are marked stale and refetch when next used.
 */
export function invalidateMoney(client: QueryClient, messId: number): Promise<void> {
  return Promise.all(MONEY_QUERY_PREFIXES.map((prefix) => client.invalidateQueries({ queryKey: [prefix, messId] }))).then(() => undefined);
}
