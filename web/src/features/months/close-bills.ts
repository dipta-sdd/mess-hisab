import type { Bill, CloseBillEdit } from "@/lib/api/contract";
import { paisaToTakaInput, parseTakaToPaisa } from "@/lib/format/money-input";

/** Typed text for one bill's amount and per-member amounts; kept in the browser until the month is closed. */
export interface BillDraft { amount: string; overrides: Record<number, string> }
export interface NewBillDraft extends BillDraft { key: string; name: string; split_type: "equal" | "fixed_per_person" }
export interface BillDrafts { existing: Record<number, BillDraft>; created: NewBillDraft[] }

export const noDrafts: BillDrafts = { existing: {}, created: [] };

/** What the bill looks like on the server right now, as typed text. */
export function draftOf(bill: Bill): BillDraft {
  return {
    amount: bill.amount_paisa > 0 ? paisaToTakaInput(bill.amount_paisa) : "",
    overrides: Object.fromEntries(bill.overrides.map((o) => [o.member_id, paisaToTakaInput(o.amount_paisa)])),
  };
}

function differs(a: BillDraft, b: BillDraft, memberIds: number[]): boolean {
  return a.amount !== b.amount || memberIds.some((id) => (a.overrides[id] ?? "") !== (b.overrides[id] ?? ""));
}

function toInput(draft: BillDraft, memberIds: number[]): { amount_paisa?: number; overrides: { member_id: number; amount_paisa: number }[]; invalid: boolean } {
  let invalid = false;
  const out: { amount_paisa?: number; overrides: { member_id: number; amount_paisa: number }[] } = { overrides: [] };
  if (draft.amount.trim() !== "") {
    const parsed = parseTakaToPaisa(draft.amount, { allowZero: true });
    if (parsed.ok) out.amount_paisa = parsed.paisa;
    else invalid = true;
  }
  for (const id of memberIds) {
    const text = draft.overrides[id] ?? "";
    if (text.trim() === "") continue;
    const parsed = parseTakaToPaisa(text, { allowZero: true });
    if (parsed.ok) out.overrides.push({ member_id: id, amount_paisa: parsed.paisa });
    else invalid = true;
  }
  return { ...out, invalid };
}

/** The edits to send with the close: only bills that really changed, plus every new bill. `invalid` = a typed amount is not a number. */
export function buildEdits(drafts: BillDrafts, bills: Bill[], memberIds: number[]): { edits: CloseBillEdit[]; invalid: boolean } {
  const edits: CloseBillEdit[] = [];
  let invalid = false;
  for (const [key, draft] of Object.entries(drafts.existing)) {
    const bill = bills.find((b) => b.category_id === Number(key));
    if (!bill || !differs(draft, draftOf(bill), memberIds)) continue;
    const { invalid: bad, ...input } = toInput(draft, memberIds);
    invalid ||= bad;
    edits.push({ category_id: bill.category_id, ...input });
  }
  for (const bill of drafts.created) {
    const { invalid: bad, ...input } = toInput(bill, memberIds);
    invalid ||= bad;
    edits.push({ name: bill.name, split_type: bill.split_type, ...input });
  }
  return { edits, invalid };
}
