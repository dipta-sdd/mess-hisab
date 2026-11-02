import { describe, expect, expectTypeOf, it } from "vitest";
import AuditLogFx from "../../../../docs/contract-fixtures/AuditLog.json";
import BillFx from "../../../../docs/contract-fixtures/Bill.json";
import CategoryFx from "../../../../docs/contract-fixtures/Category.json";
import ExpenseFx from "../../../../docs/contract-fixtures/Expense.json";
import ExportFx from "../../../../docs/contract-fixtures/Export.json";
import InviteFx from "../../../../docs/contract-fixtures/Invite.json";
import MealEntryFx from "../../../../docs/contract-fixtures/MealEntry.json";
import MemberFx from "../../../../docs/contract-fixtures/Member.json";
import MemberMonthSettingFx from "../../../../docs/contract-fixtures/MemberMonthSetting.json";
import MembershipFx from "../../../../docs/contract-fixtures/Membership.json";
import MessFx from "../../../../docs/contract-fixtures/Mess.json";
import MonthFx from "../../../../docs/contract-fixtures/Month.json";
import PaymentFx from "../../../../docs/contract-fixtures/Payment.json";
import RecoverableFx from "../../../../docs/contract-fixtures/Recoverable.json";
import UserFx from "../../../../docs/contract-fixtures/User.json";
import * as C from "./contract";

// Compile-time: fixture key sets == contract.ts key sets (checked by `tsc --noEmit` in `pnpm test`).
expectTypeOf<keyof typeof AuditLogFx>().toEqualTypeOf<keyof C.AuditLog>();
expectTypeOf<keyof typeof BillFx>().toEqualTypeOf<keyof C.Bill>();
expectTypeOf<keyof typeof CategoryFx>().toEqualTypeOf<keyof C.Category>();
expectTypeOf<keyof typeof ExpenseFx>().toEqualTypeOf<keyof C.Expense>();
expectTypeOf<keyof typeof ExportFx>().toEqualTypeOf<keyof C.Export>();
expectTypeOf<keyof typeof InviteFx>().toEqualTypeOf<keyof C.Invite>();
expectTypeOf<keyof typeof MealEntryFx>().toEqualTypeOf<keyof C.MealEntry>();
expectTypeOf<keyof typeof MemberFx>().toEqualTypeOf<keyof C.Member>();
expectTypeOf<keyof typeof MemberMonthSettingFx>().toEqualTypeOf<keyof C.MemberMonthSetting>();
expectTypeOf<keyof typeof MembershipFx>().toEqualTypeOf<keyof C.Membership>();
expectTypeOf<keyof typeof MessFx>().toEqualTypeOf<keyof C.Mess>();
expectTypeOf<keyof typeof MonthFx>().toEqualTypeOf<keyof C.Month>();
expectTypeOf<keyof typeof PaymentFx>().toEqualTypeOf<keyof C.Payment>();
expectTypeOf<keyof typeof RecoverableFx>().toEqualTypeOf<keyof C.Recoverable>();
expectTypeOf<keyof typeof UserFx>().toEqualTypeOf<keyof C.User>();

describe("contract fixtures", () => {
  it("use only known enum values", () => {
    expect(C.ROUNDING_MODES).toContain(MessFx.rounding_mode);
    expect(C.MEAL_TRACKINGS).toContain(MessFx.meal_tracking);
    expect(C.MEAL_ENTRY_BY).toContain(MessFx.meal_entry_by);
    expect(C.MONTH_STATUSES).toContain(MonthFx.status);
    expect(C.GROUPS).toContain(CategoryFx.group);
    expect(C.SPLIT_TYPES).toContain(CategoryFx.split_type);
    expect(C.PAID_BY).toContain(ExpenseFx.paid_by);
    expect(C.EXPENSE_STATUSES).toContain(ExpenseFx.status);
    expect(C.GROUPS).toContain(PaymentFx.group);
    expect(C.DOESNT_PAY_MODES).toContain(RecoverableFx.mode);
    expect(C.RECOVERABLE_STATUSES).toContain(RecoverableFx.status);
    expect(C.EXPORT_STATUSES).toContain(ExportFx.status);
    expect(C.LOCALES).toContain(UserFx.locale);
  });

  it("keeps money and meals as integers", () => {
    const all: Record<string, unknown>[] = [MessFx, ExpenseFx, PaymentFx, BillFx, RecoverableFx, MealEntryFx, MemberMonthSettingFx];
    for (const fx of all) {
      for (const [key, value] of Object.entries(fx)) {
        if ((key.endsWith("_paisa") || key.endsWith("_centi")) && value !== null) expect(Number.isInteger(value), key).toBe(true);
      }
    }
  });
});
