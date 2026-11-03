import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import HistoryFx from "../../../../docs/contract-fixtures/History.json";
import StatementFx from "../../../../docs/contract-fixtures/Statement.json";
import MemberHistoryFx from "../../../../docs/contract-fixtures/MemberHistory.json";
import type { HistoryRow, Member, MemberHistoryRow, Mess, Statement } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { HistoryPage } from "./history-page";
import { StatementPage } from "./statement-page";

const BASE = `${API_BASE_URL}/api/messes/7`;
const memberHistRequests: string[] = [];
const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals" } as Mess;
const me = { id: 2, display_name: "Karim" } as Member;
const members = [
  { id: 1, display_name: "X", archived_at: null },
  { id: 2, display_name: "Karim", archived_at: null },
] as Member[];

const fx = StatementFx as Statement;
const statement: Statement = {
  ...fx,
  carry_in_paisa: -30000,
  lines: [
    { kind: "payment", group: "fixed", label: "Payment", date: "2026-11-03", amount_paisa: 50000 },
    { kind: "fixed_bill", group: "fixed", label: "Rent", date: null, amount_paisa: -200000 },
    { kind: "carry_in", group: "fixed", label: "Last month due", date: null, amount_paisa: -30000 },
    { kind: "meal_charge", group: "meals", label: "Meal charge", date: null, amount_paisa: -80000 },
    { kind: "own_pocket_expense", group: "meals", label: "Paid from pocket: rice", date: "2026-11-04", amount_paisa: 150000 },
  ],
};

const hist: HistoryRow[] = [
  { ...(HistoryFx as HistoryRow), month_id: 2, starts_on: "2026-11-01" },
  { ...(HistoryFx as HistoryRow), month_id: 1, starts_on: "2026-10-01", status: "closed", closed_at: "2026-11-01T00:00:00Z" },
];

const memberHist: MemberHistoryRow[] = [
  { ...(MemberHistoryFx as MemberHistoryRow), month_id: 2, starts_on: "2026-11-01", balance_paisa: -110000 },
  { ...(MemberHistoryFx as MemberHistoryRow), month_id: 1, starts_on: "2026-10-01", status: "closed", balance_paisa: 40000 },
];

function mockApi(data: Statement = statement, mh: MemberHistoryRow[] = memberHist) {
  const requests: string[] = [];
  server.use(
    http.get(`${BASE}/statements/:member/history`, ({ params }) => {
      memberHistRequests.push(String(params.member));
      return HttpResponse.json({ data: mh });
    }),
    http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
    http.get(`${BASE}/history`, () => HttpResponse.json({ data: hist })),
    http.get(`${BASE}/statements/:member`, ({ request, params }) => {
      requests.push(`${params.member}${new URL(request.url).search}`);
      return HttpResponse.json({ data });
    }),
  );
  return requests;
}

describe("StatementPage", () => {
  it("shows last month due first, then Fixed and Meals groups with translated kind labels", async () => {
    const requests = mockApi();
    renderWithProviders(<StatementPage memberId={1} />, { messId: 7 });
    const first = await screen.findByTestId("line-carry_in");
    expect(first).toHaveTextContent("Last month due");
    expect(first).toHaveTextContent("-৳300.00");

    // One passbook list: undated charges post first (Fixed before Meals), then dated lines by date.
    const all = screen.getAllByTestId(/^line-/).map((n) => n.getAttribute("data-testid"));
    expect(all).toEqual(["line-carry_in", "line-fixed_bill", "line-meal_charge", "line-payment", "line-own_pocket_expense"]);
    // carry_in appears once (not duplicated from lines)
    expect(all.filter((k) => k === "line-carry_in").length).toBe(1);
    expect(screen.queryByTestId("section-fixed")).toBeNull();
    expect(screen.queryByTestId("section-meals")).toBeNull();

    // Each line carries its amount, its running balance and a small group label.
    const rent = screen.getByTestId("line-fixed_bill");
    expect(rent).toHaveTextContent("Rent");
    expect(rent).toHaveTextContent("Fixed");
    expect(rent).toHaveTextContent("-৳2,000.00");
    expect(rent).toHaveTextContent("-৳2,300.00");
    expect(screen.getByTestId("line-payment")).toHaveTextContent("Payment");
    const meal = screen.getByTestId("line-meal_charge");
    expect(meal).toHaveTextContent("Meal charge");
    expect(meal).toHaveTextContent("Meals");
    const pocket = screen.getByTestId("line-own_pocket_expense");
    expect(pocket).toHaveTextContent("Paid from own pocket");
    expect(pocket).toHaveTextContent("Paid from pocket: rice");
    expect(requests[0]).toBe("1");
  });

  it("shows totals, outstanding, deposit and overdue from the server", async () => {
    mockApi();
    renderWithProviders(<StatementPage memberId={1} />, { messId: 7 });
    expect(await screen.findByTestId("stmt-total")).toHaveTextContent("Due ৳1,600.00");
    expect(screen.getByTestId("stmt-fixed-balance")).toHaveTextContent("Due ৳2,300.00");
    expect(screen.getByTestId("stmt-meals-balance")).toHaveTextContent("Credit ৳700.00");
    expect(screen.getByTestId("stmt-outstanding")).toHaveTextContent("৳1,600.00");
    expect(screen.getByTestId("stmt-deposit-outstanding")).toHaveTextContent("৳0.00");
    expect(screen.getByTestId("overdue-fixed")).toHaveTextContent("Bills 5 days overdue");
    expect(screen.queryByTestId("overdue-deposit")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("X's statement");
  });

  it("defaults to the current user's own member and sends month_id on change", async () => {
    const requests = mockApi();
    const user = userEvent.setup();
    renderWithProviders(<StatementPage />, { messId: 7 });
    await screen.findByTestId("stmt-total");
    expect(requests[0]).toBe("2");
    const stepper = screen.getByTestId("month-stepper");
    await waitFor(() => expect(within(stepper).getByText("October 2026")).toBeInTheDocument());
    await user.click(within(stepper).getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(requests.at(-1)).toBe("2?month_id=2"));
    await user.selectOptions(screen.getByLabelText("Member"), "X");
    await waitFor(() => expect(requests.at(-1)).toBe("1?month_id=2"));
  });

  it("offers a Report tab that loads the mess report", async () => {
    mockApi();
    server.use(
      http.get(`${BASE}/months`, () => HttpResponse.json({ data: [{ id: 1, starts_on: "2026-09-01", ends_on: "2026-09-30", status: "closed" }] })),
      http.get(`${BASE}/reports/monthly/:month`, () => HttpResponse.json({ code: "month_not_closed", message: "x" }, { status: 409 })),
    );
    const user = userEvent.setup();
    renderWithProviders(<StatementPage />, { messId: 7 });
    await screen.findByTestId("stmt-total");
    expect(screen.getByRole("tab", { name: "Statement" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("tab", { name: "Report" }));
    expect(screen.getByRole("tab", { name: "Report" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByTestId("report-root")).toBeInTheDocument();
  });

  it("shows a friendly not-found and a generic error", async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
      http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
      http.get(`${BASE}/history`, () => HttpResponse.json({ data: hist })),
      http.get(`${BASE}/statements/:member`, () => HttpResponse.json({ message: "No" }, { status: 404 })),
    );
    renderWithProviders(<StatementPage memberId={99} />, { messId: 7 });
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find that member or month.");
  });

  it("renders in Bangla", async () => {
    mockApi();
    renderWithProviders(<StatementPage memberId={1} />, { messId: 7, locale: "bn" });
    expect(await screen.findByText("গত মাসের বাকি")).toBeInTheDocument();
    expect(screen.getByTestId("stmt-total")).toHaveTextContent("১,৬০০");
    expect(screen.getByText("মিলের বিল")).toBeInTheDocument();
    expectBanglaOnly(["Paid from pocket: rice", "X"]);
  });
});

describe("HistoryPage", () => {
  it("lists months newest first and links each to that month's dashboard", async () => {
    mockApi();
    renderWithProviders(<HistoryPage />, { messId: 7 });
    const row2 = await screen.findByTestId("history-row-2");
    const rows = screen.getAllByTestId(/^history-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["history-row-2", "history-row-1"]);
    expect(within(row2).getByRole("link", { name: "November 2026" })).toHaveAttribute("href", "/7?month=2");
    expect(within(screen.getByTestId("history-row-1")).getByRole("link", { name: "October 2026" })).toHaveAttribute("href", "/7?month=1");
    expect(within(row2).getByText("৳4,200.00")).toBeInTheDocument();
    expect(within(row2).getByText("৳700.00")).toBeInTheDocument();
  });

  it("shows an error state", async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
      http.get(`${BASE}/history`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
    );
    renderWithProviders(<HistoryPage />, { messId: 7 });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the history");
  });
});

describe("Statement balance-by-month chart", () => {
  it("plots the member's monthly balances oldest to newest, credit up and due down", async () => {
    memberHistRequests.length = 0;
    mockApi();
    renderWithProviders(<StatementPage memberId={1} />, { messId: 7 });
    const chart = await screen.findByTestId("chart-balance-by-month");
    const cols = await within(chart).findAllByTestId(/^col-/);
    expect(cols.map((c) => c.getAttribute("aria-label"))).toEqual(["October 2026: Credit ৳400.00", "November 2026: Due ৳1,100.00"]);
    expect(cols[0].querySelector(".bg-success")).not.toBeNull();
    expect(cols[1].querySelector(".bg-danger")).not.toBeNull();
    expect(memberHistRequests[0]).toBe("1");
  });

  it("shows the tooltip on keyboard focus and offers a table", async () => {
    mockApi();
    const user = userEvent.setup();
    renderWithProviders(<StatementPage memberId={1} />, { messId: 7 });
    const chart = await screen.findByTestId("chart-balance-by-month");
    const col = await within(chart).findByTestId("col-2");
    col.focus();
    expect(await within(chart).findByRole("tooltip")).toHaveTextContent("Due ৳1,100.00");
    await user.click(within(chart).getByRole("button", { name: "Show as table" }));
    expect(within(chart).getByRole("rowheader", { name: "October 2026" })).toBeInTheDocument();
    expect(within(chart).getByRole("cell", { name: "Credit ৳400.00" })).toBeInTheDocument();
  });

  it("shows an empty state, and an error without breaking the page", async () => {
    mockApi(statement, []);
    const first = renderWithProviders(<StatementPage memberId={1} />, { messId: 7 });
    expect(await screen.findByText("No months to show yet.")).toBeInTheDocument();
    first.unmount();

    mockApi();
    server.use(http.get(`${BASE}/statements/:member/history`, () => HttpResponse.json({ message: "boom" }, { status: 500 })));
    renderWithProviders(<StatementPage memberId={1} />, { messId: 7 });
    expect(await screen.findByText("Could not load the balance history.")).toBeInTheDocument();
    expect(screen.getByTestId("stmt-total")).toBeInTheDocument();
  });

  it("renders in Bangla", async () => {
    mockApi();
    renderWithProviders(<StatementPage memberId={1} />, { messId: 7, locale: "bn" });
    const chart = await screen.findByTestId("chart-balance-by-month");
    await within(chart).findAllByTestId(/^col-/);
    expect(within(chart).getByText("মাস অনুযায়ী ব্যালেন্স")).toBeInTheDocument();
    expectBanglaOnly(["Paid from pocket: rice", "X"]);
  });
});

describe("History charts", () => {
  const rate = (month_id: number, starts_on: string, meal_rate_paisa: number, total_meals_centi: number, expenses_paisa: number): HistoryRow => ({
    ...(HistoryFx as HistoryRow), month_id, starts_on, meal_rate_paisa, total_meals_centi, expenses_paisa,
  });
  const three = [
    rate(3, "2026-12-01", 4500, 5000, 250000),
    rate(2, "2026-11-01", 0, 0, 100000),
    rate(1, "2026-10-01", 4000, 5000, 200000),
  ];

  it("plots meal rate oldest to newest with a gap for a month without meals, and expenses as columns", async () => {
    mockApi();
    server.use(http.get(`${BASE}/history`, () => HttpResponse.json({ data: three })));
    renderWithProviders(<HistoryPage />, { messId: 7 });
    const line = await screen.findByTestId("chart-meal-rate");
    expect(within(line).getByTestId("pt-1")).toHaveAttribute("aria-label", "October 2026: ৳40.00");
    expect(within(line).getByTestId("pt-3")).toHaveAttribute("aria-label", "December 2026: ৳45.00");
    expect(within(line).queryByTestId("pt-2")).toBeNull();
    expect(line.querySelectorAll("path")).toHaveLength(2);
    expect(within(line).queryByText(/trend will show up/)).toBeNull();

    const cols = within(screen.getByTestId("chart-expenses")).getAllByTestId(/^col-/);
    expect(cols.map((c) => c.getAttribute("aria-label"))).toEqual([
      "October 2026: ৳2,000.00", "November 2026: ৳1,000.00", "December 2026: ৳2,500.00",
    ]);
  });

  it("shows the point on hover/focus and a table with the gap labelled", async () => {
    mockApi();
    server.use(http.get(`${BASE}/history`, () => HttpResponse.json({ data: three })));
    const user = userEvent.setup();
    renderWithProviders(<HistoryPage />, { messId: 7 });
    const line = await screen.findByTestId("chart-meal-rate");
    within(line).getByTestId("pt-3").focus();
    expect(await within(line).findByRole("tooltip")).toHaveTextContent("৳45.00");
    await user.click(within(line).getByRole("button", { name: "Show as table" }));
    const novRow = within(line).getByRole("rowheader", { name: "November 2026" }).closest("tr")!;
    expect(novRow).toHaveTextContent("No meals");
  });

  it("with a single month shows the point and the 'more months' note on both charts", async () => {
    mockApi();
    server.use(http.get(`${BASE}/history`, () => HttpResponse.json({ data: [three[0]] })));
    renderWithProviders(<HistoryPage />, { messId: 7 });
    const line = await screen.findByTestId("chart-meal-rate");
    expect(within(line).getByTestId("pt-3")).toBeInTheDocument();
    expect(within(line).getByText("The trend will show up after a few more months.")).toBeInTheDocument();
    const bars = screen.getByTestId("chart-expenses");
    expect(within(bars).getAllByTestId(/^col-/)).toHaveLength(1);
    expect(within(bars).getByText("The trend will show up after a few more months.")).toBeInTheDocument();
  });

  it("renders in Bangla", async () => {
    mockApi();
    server.use(http.get(`${BASE}/history`, () => HttpResponse.json({ data: three })));
    renderWithProviders(<HistoryPage />, { messId: 7, locale: "bn" });
    const line = await screen.findByTestId("chart-meal-rate");
    expect(within(line).getByText("মাস অনুযায়ী মিল রেট")).toBeInTheDocument();
    expectBanglaOnly();
  });
});
