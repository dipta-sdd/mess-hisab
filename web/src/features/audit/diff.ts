export interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
  hasBefore: boolean;
  hasAfter: boolean;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Keys that differ between the snapshots (created: all after keys; deleted: all before keys). */
export function diffRows(before: Record<string, unknown>, after: Record<string, unknown>): DiffRow[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const rows: DiffRow[] = [];
  for (const key of keys) {
    const hasBefore = key in before;
    const hasAfter = key in after;
    if (hasBefore && hasAfter && same(before[key], after[key])) continue;
    rows.push({ key, before: before[key], after: after[key], hasBefore, hasAfter });
  }
  return rows;
}

export const isMoneyKey = (key: string) => key.endsWith("_paisa");

/** Event groups offered in the filter (prefix with trailing dot, as the API expects). */
export const EVENT_GROUPS = [
  "expense.",
  "payment.",
  "meal_entry.",
  "month.",
  "month_bill.",
  "charge_override.",
  "member_month_setting.",
  "mess_member.",
  "member.",
  "ledger_entry.",
  "payout.",
  "doesnt_pay.",
  "recoverable.",
  "recoverable_repayment.",
  "category.",
  "invite.",
  "mess.",
  "settings.",
  "role.",
] as const;
