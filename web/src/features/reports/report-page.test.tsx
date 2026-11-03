import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mess, Month } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { expectBanglaOnly } from "@/test/bangla";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { ReportsPage } from "./report-page";
import type { MonthlyReport } from "./types";

const BASE = `${API_BASE_URL}/api/messes/7`;
const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals" } as Mess;
const month = (id: number, starts_on: string, ends_on: string, status: "open" | "closed"): Month =>
  ({ id, starts_on, ends_on, status, fixed_deadline: null, deposit_deadline: null, deposit_paisa: 0, zero_meal_resolution: null, closed_at: status === "closed" ? "2026-11-01T06:00:00Z" : null }) as Month;

const oct = month(1, "2026-10-01", "2026-10-31", "closed");
const nov = month(2, "2026-11-01", "2026-11-30", "open");
const months = [nov, oct];

const report: MonthlyReport = {
  month: oct,
  mess,
  summary: {
    member_count: 2, expense_count: 2, expenses_paisa: 500000, fixed_expenses_paisa: 300000, meals_expenses_paisa: 200000,
    fixed_bills_paisa: 300000, fixed_charged_paisa: 300000, meals_charged_paisa: 200000, charged_paisa: 500000, paid_paisa: 400000, spent_paisa: 50000,
    total_due_paisa: 80000, total_credit_paisa: 30000, rounding_extra_paisa: 0,
  },
  members: [
    { member_id: 1, display_name: "Rahim", carry_in_paisa: 0, fixed_bill_paisa: 150000, meals_bill_paisa: 100000, share_paisa: 250000, paid_paisa: 120000, spent_paisa: 50000, balance_paisa: -80000 },
    { member_id: 2, display_name: "Karim", carry_in_paisa: 0, fixed_bill_paisa: 150000, meals_bill_paisa: 100000, share_paisa: 250000, paid_paisa: 280000, spent_paisa: 0, balance_paisa: 30000 },
  ],
  expenses: [
    { id: 11, spent_on: "2026-10-03", category_id: 1, category: "Rent", group: "fixed", amount_paisa: 300000, paid_by: "cash", paid_by_member_id: null, payer_name: null, note: "November rent" },
    { id: 12, spent_on: "2026-10-05", category_id: 2, category: "Fish", group: "meals", amount_paisa: 200000, paid_by: "member", paid_by_member_id: 2, payer_name: "Karim", note: "Rohu fish" },
  ],
  meals: {
    total_meals_centi: 6000, meal_rate_paisa: 3333, food_cost_paisa: 200000,
    members: [
      { member_id: 1, display_name: "Rahim", meals_centi: 3000, effective_meals_centi: 3000, meals_bill_paisa: 100000 },
      { member_id: 2, display_name: "Karim", meals_centi: 3000, effective_meals_centi: 3000, meals_bill_paisa: 100000 },
    ],
  },
  next_month: {
    month: nov,
    fixed_deadline: "2026-11-05",
    rows: [
      { member_id: 1, display_name: "Rahim", by_category: [
        { category_id: 1, name: "Rent", split_type: "fixed_per_person", amount_paisa: 100000 },
        { category_id: 3, name: "Gas", split_type: "equal", amount_paisa: 20000 },
      ], last_month_due_paisa: 80000, last_month_credit_paisa: 0, total_paisa: 200000 },
      { member_id: 2, display_name: "Karim", by_category: [
        { category_id: 1, name: "Rent", split_type: "fixed_per_person", amount_paisa: 120000 },
        { category_id: 3, name: "Gas", split_type: "equal", amount_paisa: 20000 },
      ], last_month_due_paisa: 0, last_month_credit_paisa: 30000, total_paisa: 110000 },
    ],
  },
};

function mock(monthly: () => Response | Promise<Response> = () => HttpResponse.json({ data: report })) {
  server.use(
    http.get(`${BASE}/months`, () => HttpResponse.json({ data: months })),
    http.get(`${BASE}/reports/monthly/:month`, monthly),
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ReportsPage", () => {
  it("renders every section from the report", async () => {
    mock();
    renderWithProviders(<ReportsPage />, { messId: 7 });

    const summary = await screen.findByTestId("section-summary");
    expect(summary).toHaveTextContent("Green House");
    expect(summary).toHaveTextContent("October 2026");
    expect(screen.getByTestId("tile-expenses")).toHaveTextContent("৳5,000.00");
    expect(screen.getByTestId("tile-due")).toHaveTextContent("৳800.00");
    expect(screen.getByTestId("tile-credit")).toHaveTextContent("৳300.00");
    expect(screen.getByTestId("tile-meal-rate")).toHaveTextContent("৳33.33");

    expect(screen.getByTestId("chart-share-paid")).toBeInTheDocument();
    expect(screen.getByTestId("chart-balances")).toBeInTheDocument();
    expect(screen.getByTestId("pair-1")).toHaveTextContent("Rahim");

    const next = screen.getByTestId("section-next");
    expect(next).toHaveTextContent("To pay for November 2026");
    expect(screen.getByTestId("next-deadline")).toHaveTextContent("Pay by");
    expect(screen.getByTestId("stack-1")).toHaveTextContent("৳2,000.00");
    const rahim = screen.getByTestId("next-row-1");
    expect(within(rahim).getAllByRole("cell").map((c) => c.textContent)).toEqual(["৳1,000.00", "৳200.00", "৳800.00", "৳2,000.00"]);
    expect(screen.getByTestId("next-row-2")).toHaveTextContent("Credit ৳300.00 from last month");
    expect(within(screen.getByTestId("next-row-2")).getAllByRole("cell")[2]).toHaveTextContent("-৳300.00");
    expect(screen.queryByTestId("next-totals")).not.toBeInTheDocument();

    expect(screen.getByTestId("expense-11")).toHaveTextContent("Shared cash");
    expect(screen.getByTestId("expense-12")).toHaveTextContent("Karim");
    expect(screen.getByTestId("expenses-total")).toHaveTextContent("৳5,000.00");

    expect(screen.getByTestId("section-meals")).toBeInTheDocument();
    expect(screen.getByTestId("meal-row-2")).toHaveTextContent("৳1,000.00");
  });

  it("hides the meals section when meals are not tracked", async () => {
    mock(() => HttpResponse.json({ data: { ...report, meals: null } }));
    renderWithProviders(<ReportsPage />, { messId: 7 });
    await screen.findByTestId("section-summary");
    expect(screen.queryByTestId("section-meals")).toBeNull();
    expect(screen.queryByTestId("tile-meal-rate")).toBeNull();
  });

  it("only offers closed months and requests the newest one", async () => {
    const asked: string[] = [];
    mock(() => { return HttpResponse.json({ data: report }); });
    server.use(http.get(`${BASE}/reports/monthly/:month`, ({ params }) => { asked.push(String(params.month)); return HttpResponse.json({ data: report }); }));
    renderWithProviders(<ReportsPage />, { messId: 7 });
    await screen.findByTestId("section-summary");
    const select = screen.getByLabelText("Month");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["October 2026"]);
    expect(asked).toEqual(["1"]);
  });

  it("says so when no month is closed", async () => {
    server.use(http.get(`${BASE}/months`, () => HttpResponse.json({ data: [nov] })));
    renderWithProviders(<ReportsPage />, { messId: 7 });
    expect(await screen.findByTestId("report-none")).toHaveTextContent("no closed month");
  });

  it("explains month_not_closed with a link to Fixed", async () => {
    mock(() => HttpResponse.json({ message: "x", code: "month_not_closed" }, { status: 409 }));
    renderWithProviders(<ReportsPage />, { messId: 7 });
    const box = await screen.findByTestId("blocked-month_not_closed");
    expect(box).toHaveTextContent("not closed yet");
    expect(within(box).getByRole("link")).toHaveAttribute("href", "/7/admin/fixed?month=1");
  });

  it("explains next_month_bills_missing with a link to the next month's Fixed page", async () => {
    mock(() => HttpResponse.json({ message: "x", code: "next_month_bills_missing", next_month_id: 2 }, { status: 409 }));
    renderWithProviders(<ReportsPage />, { messId: 7 });
    const box = await screen.findByTestId("blocked-next_month_bills_missing");
    expect(box).toHaveTextContent("November 2026 has no Fixed bills yet");
    expect(within(box).getByRole("link")).toHaveAttribute("href", "/7/admin/fixed?month=2");
  });

  it("shows a generic message for other failures", async () => {
    mock(() => HttpResponse.json({ message: "boom" }, { status: 500 }));
    renderWithProviders(<ReportsPage />, { messId: 7 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the report");
  });

  it("Download PDF links to the server-made PDF of the picked month", async () => {
    mock();
    renderWithProviders(<ReportsPage />, { messId: 7 });
    await screen.findByTestId("section-summary");
    const link = await screen.findByRole("link", { name: "Download PDF" });
    expect(link.getAttribute("href")).toMatch(/\/api\/messes\/7\/reports\/monthly\/\d+\/pdf$/);
    expect(link).toHaveAttribute("download");
  });

  it("does not use landmarks that the print CSS hides", async () => {
    mock();
    renderWithProviders(<ReportsPage />, { messId: 7 });
    await screen.findByTestId("section-summary");
    const root = screen.getByTestId("report-root");
    expect(root.querySelector("header, nav, aside")).toBeNull();
  });

  it("renders fully in Bangla", async () => {
    mock();
    renderWithProviders(<ReportsPage />, { messId: 7, locale: "bn" });
    await screen.findByTestId("section-summary");
    expect(screen.getByTestId("section-next")).toHaveTextContent("নভেম্বর");
    expect(screen.getByTestId("tile-expenses")).toHaveTextContent("৫,০০০.০০");
    expect(screen.getByRole("link", { name: "পিডিএফ ডাউনলোড" })).toBeInTheDocument();
    expectBanglaOnly(["Green House"]);
  });
});
