import type { MealEntry, MealTracking } from "@/lib/api/contract";
import type { MealInput } from "@/lib/api/contract";
import { MAX_DAY_CENTI, MAX_MONTH_CENTI, parseMealsToCenti } from "./centi";

export interface Ticks { breakfast: boolean; lunch: boolean; dinner: boolean }
/** What the person has typed in one cell but not yet saved. Only touched parts are present. */
export interface CellDraft { meals?: string; guest?: string; ticks?: Ticks }
export type Drafts = Record<string, CellDraft>;

export const cellKey = (memberId: number, date: string) => `${memberId}|${date}`;

export function parseKey(key: string): { memberId: number; date: string } {
  const [m, d] = key.split("|");
  return { memberId: Number(m), date: d };
}

export const maxFor = (style: MealTracking) => (style === "month_total" ? MAX_MONTH_CENTI : MAX_DAY_CENTI);

export interface BuiltPayload {
  /** Entries to send, in the same order as `keys`. */
  entries: MealInput[];
  keys: string[];
  /** Cells whose typed text is not a valid half-meal step. */
  invalid: string[];
}

/** Turns drafts into API entries. Meals are parsed to integer centi-meals here; nothing is multiplied as a float. */
export function buildPayload(style: MealTracking, drafts: Drafts): BuiltPayload {
  const out: BuiltPayload = { entries: [], keys: [], invalid: [] };
  const max = maxFor(style);

  for (const [key, draft] of Object.entries(drafts)) {
    const { memberId, date } = parseKey(key);
    const entry: MealInput = { member_id: memberId, entry_date: date };
    let touched = false;
    let bad = false;

    if (style === "bld_ticks") {
      if (draft.ticks) {
        entry.breakfast = draft.ticks.breakfast;
        entry.lunch = draft.ticks.lunch;
        entry.dinner = draft.ticks.dinner;
        touched = true;
      }
    } else if (draft.meals !== undefined) {
      const parsed = parseMealsToCenti(draft.meals, max);
      if (parsed.ok) entry.meals_centi = parsed.centi;
      else bad = true;
      touched = true;
    }

    if (draft.guest !== undefined) {
      const parsed = parseMealsToCenti(draft.guest, max);
      if (parsed.ok) entry.guest_meals_centi = parsed.centi;
      else bad = true;
      touched = true;
    }

    if (bad) out.invalid.push(key);
    else if (touched) {
      out.entries.push(entry);
      out.keys.push(key);
    }
  }
  return out;
}

/** Is this cell's typed text acceptable? (used for aria-invalid while typing) */
export function draftProblems(style: MealTracking, draft: CellDraft | undefined): { meals: boolean; guest: boolean } {
  const max = maxFor(style);
  return {
    meals: draft?.meals !== undefined && !parseMealsToCenti(draft.meals, max).ok,
    guest: draft?.guest !== undefined && !parseMealsToCenti(draft.guest, max).ok,
  };
}

export const ticksOf = (entry: MealEntry | undefined, draft: CellDraft | undefined): Ticks =>
  draft?.ticks ?? { breakfast: entry?.breakfast ?? false, lunch: entry?.lunch ?? false, dinner: entry?.dinner ?? false };
