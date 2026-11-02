import { z } from "zod";
import { parseTakaToPaisa } from "@/lib/format/money-input";

/** Messages are i18n keys under `payments.form.errors.*`. */
export const paymentFormSchema = z.object({
  member_id: z.string().min(1, "memberRequired"),
  group: z.enum(["fixed", "meals"], { message: "groupRequired" }),
  amount: z.string().superRefine((value, ctx) => {
    const parsed = parseTakaToPaisa(value);
    if (parsed.ok) return;
    const message =
      parsed.reason === "empty" ? "amountRequired" : parsed.reason === "zero" ? "amountZero" : parsed.reason === "tooLarge" ? "amountTooLarge" : "amountInvalid";
    ctx.addIssue({ code: "custom", message });
  }),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRequired"),
  note: z.string().max(500, "noteTooLong"),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
