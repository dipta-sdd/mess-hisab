import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Mess, Month } from "@/lib/api/contract";
import type { MonthlyReport } from "@/features/reports/types";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import type { BlockContext } from "./blocks";
import { ReportPreview } from "./report-preview";

const BASE = `${API_BASE_URL}/api/messes/7`;
const month = { id: 2, starts_on: "2026-11-01", ends_on: "2026-11-30", status: "open", fixed_deadline: null, deposit_deadline: null, closed_at: null } as Month;
const ctx: BlockContext = { messId: 7, money: (p) => `৳${p / 100}`, balance: (p) => `${p}`, nameOf: (id) => `M${id}`, monthLabelOf: (id) => `m${id}` };

const report = {
  month,
  mess: { id: 7, name: "Green House", rounding_mode: "two_decimals" } as Mess,
  summary: { member_count: 1, expense_count: 0, expenses_paisa: 0, fixed_expenses_paisa: 0, meals_expenses_paisa: 0, fixed_bills_paisa: 0, fixed_charged_paisa: 0, meals_charged_paisa: 0, charged_paisa: 0, paid_paisa: 0, spent_paisa: 0, total_due_paisa: 0, total_credit_paisa: 0, rounding_extra_paisa: 0 },
  members: [{ member_id: 1, display_name: "Rahim", carry_in_paisa: 0, fixed_bill_paisa: 0, meals_bill_paisa: 0, share_paisa: 0, paid_paisa: 0, spent_paisa: 0, balance_paisa: 0 }],
  expenses: [],
  meals: null,
  next_month: null,
  preview: { blocks: [{ code: "pending_expenses", data: { count: 2 } }] },
} as unknown as MonthlyReport;

describe("ReportPreview", () => {
  it("builds the report from the answers, marks it as a preview and warns about what would block a close", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
      http.get(`${BASE}/reports/monthly/2/preview/next-bills`, () => HttpResponse.json({ data: { next_month_exists: false, bills: [] } })),
      http.post(`${BASE}/reports/monthly/2/preview`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: report });
      }),
    );
    renderWithProviders(
      <ReportPreview messId={7} month={month} resolution="carry" edits={[]} editsInvalid={false} names={{}} members={[]} ctx={ctx} onZeroMeals={() => {}} />,
    );
    const button = screen.getByTestId("preview-report");
    await userEvent.click(button);
    expect(await screen.findByTestId("preview-banner")).toBeInTheDocument();
    expect(screen.getByTestId("block-pending_expenses")).toBeInTheDocument();
    expect(screen.getByTestId("preview-download")).toBeInTheDocument();
    expect(screen.getByText("Rahim", { selector: "th" })).toBeInTheDocument();
    expect(body).toMatchObject({ zero_meal_resolution: "carry", next_bills: [] });
  });
});
