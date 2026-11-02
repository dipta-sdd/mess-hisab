import { z } from "zod";
import { parseTakaToPaisa } from "@/lib/format/money-input";

/** Messages are i18n keys under `expenses.form.errors.*`. */
export const expenseFormSchema = z
  .object({
    category_id: z.string().min(1, "categoryRequired"),
    amount: z.string().superRefine((value, ctx) => {
      const parsed = parseTakaToPaisa(value);
      if (parsed.ok) return;
      const message =
        parsed.reason === "empty" ? "amountRequired" : parsed.reason === "zero" ? "amountZero" : parsed.reason === "tooLarge" ? "amountTooLarge" : "amountInvalid";
      ctx.addIssue({ code: "custom", message });
    }),
    spent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRequired"),
    note: z.string().max(500, "noteTooLong"),
    /** me = own pocket; cash = mess cash (manager); other = another member's pocket (manager). */
    payer: z.enum(["me", "cash", "other"]),
    payer_member_id: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.payer === "other" && value.payer_member_id === "") {
      ctx.addIssue({ code: "custom", path: ["payer_member_id"], message: "payerRequired" });
    }
  });

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;
