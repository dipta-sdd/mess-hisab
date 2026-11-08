import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import DashboardFx from "../../../../docs/contract-fixtures/Dashboard.json";
import HistoryFx from "../../../../docs/contract-fixtures/History.json";
import type { Category, Dashboard, DashboardRow, Expense, HistoryRow, Member, Mess } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { StaffDashboard } from "./staff-dashboard";

const BASE = `${API_BASE_URL}/api/messes/7`;
const spendRequests: string[] = [];

const fixture = DashboardFx as Dashboard;
const credit: DashboardRow = {
  ...fixture.members[0], member_id: 2, display_name: "Karim", balance_paisa: 70000, fixed_balance_paisa: 0, meals_balance_paisa: 70000,
  fixed_outstanding_paisa: 0, fixed_overdue_days: 0, deposit_overdue_days: 0,
};
const depositLate: DashboardRow = {
  ...credit, member_id: 3, display_name: "Salma", balance_paisa: -50000, deposit_outstanding_paisa: 50000, deposit_overdue_days: 12,
};
const dashboard: Dashboard = { ...fixture, members: [fixture.members[0], credit, depositLate] };

const history: HistoryRow[] = [
  { ...(HistoryFx as HistoryRow), month_id: 2, starts_on: "2026-11-01" },
  { ...(HistoryFx as HistoryRow), month_id: 1, starts_on: "2026-10-01", status: "closed", closed_at: "2026-11-01T00:00:00Z" },
];
const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals" } as Mess;
const me = { id: 1, display_name: "X" } as Member;

const categories = [
  { id: 5, group: "meals", name: "Fish", split_type: "by_meals", sort: 0, is_default: true, archived_at: null },
  { id: 6, group: "fixed", name: "Gas", split_type: "fixed_per_person", sort: 1, is_default: true, archived_at: null },
] as Category[];
const exp = (id: number, category_id: number, amount_paisa: number) => ({ id, month_id: 1, category_id, amount_paisa, status: "approved" }) as Expense;
const expenses = [exp(1, 6, 20000), exp(2, 5, 100000), exp(3, 5, 50000)];

function mockApi(data: Dashboard = dashboard, spend: Expense[] = expenses) {
  const requests: string[] = [];
  server.use(
    http.get(`${BASE}/categories`, () => HttpResponse.json({ data: categories })),
    http.get(`${BASE}/expenses`, ({ request }) => {
      spendRequests.push(new URL(request.url).search);
      return HttpResponse.json({ data: spend });
    }),
    http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
    http.get(`${BASE}/history`, () => HttpResponse.json({ data: history })),
    http.get(`${BASE}/dashboard`, ({ request }) => {
      requests.push(new URL(request.url).search);
      return HttpResponse.json({ data });
    }),
  );
  return requests;
}

const render = (props = {}, locale: "en" | "bn" = "en") => renderWithProviders(<StaffDashboard {...props} />, { messId: 7, locale });

describe("StaffDashboard", () => {
  it("renders totals and the cash card from the server, without the manager balance", async () => {
    const requests = mockApi();
    render();
    expect(await screen.findByTestId("stat-fixed-bills")).toHaveTextContent("৳8,400.00");
    expect(screen.getByTestId("stat-meal-rate")).toHaveTextContent("৳40.00");
    expect(screen.getByTestId("stat-total-meals")).toHaveTextContent("50");
    const cash = screen.getByTestId("cash-card");
    expect(cash).toHaveTextContent("Cash in manager's hand");
    expect(cash).toHaveTextContent("৳0.00");
    expect(screen.getByTestId("stat-rounding")).toHaveTextContent("৳0.00");
    expect(screen.queryByTestId("stat-manager-balance")).toBeNull();
    expect(screen.getByTestId("month-status")).toHaveTextContent("Status: Open");
    // default month: month_id is omitted
    expect(requests[0]).toBe("");
  });

  it("shows due and credit per member and links to the statement", async () => {
    mockApi();
    render();
    const row = await screen.findByTestId("member-row-1");
    // Open month: the fixed due is not reduced by the meals credit, which is shown apart.
    expect(within(row).getByText("Due ৳2,300.00")).toBeInTheDocument();
    expect(within(row).getByText("Credit ৳700.00")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "X" })).toHaveAttribute("href", "/7/statements/1?month=1");
    const credited = screen.getByTestId("member-row-2");
    expect(within(credited).getAllByText("Credit ৳700.00").length).toBe(1);
    expect(within(screen.getByTestId("member-card-2")).getByRole("link")).toHaveAttribute("href", "/7/statements/2?month=1");
  });

  it("combines fixed and meals into one balance once the month is closed", async () => {
    mockApi({ ...dashboard, month: { ...dashboard.month, status: "closed" } });
    render();
    const row = await screen.findByTestId("member-row-1");
    expect(within(row).getByText("Due ৳1,600.00")).toBeInTheDocument();
    expect(within(row).queryByText("Credit ৳700.00")).toBeNull();
  });

  it("shows overdue badges and filters to overdue members only", async () => {
    mockApi();
    const user = userEvent.setup();
    render();
    const row = await screen.findByTestId("member-row-1");
    expect(within(row).getByTestId("overdue-fixed")).toHaveTextContent("Bills 5 days overdue");
    expect(within(row).queryByTestId("overdue-deposit")).toBeNull();
    expect(within(screen.getByTestId("member-row-3")).getByTestId("overdue-deposit")).toHaveTextContent("Deposit 12 days overdue");

    await user.click(screen.getByRole("button", { name: "Overdue (2)" }));
    expect(screen.queryByTestId("member-row-2")).toBeNull();
    expect(screen.getByTestId("member-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("member-row-3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "All (3)" }));
    expect(screen.getByTestId("member-row-2")).toBeInTheDocument();
  });

  it("tells you when nobody is overdue", async () => {
    mockApi({ ...dashboard, members: [credit] });
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: "Overdue (0)" }));
    expect(screen.getByText("Nobody is overdue.")).toBeInTheDocument();
  });

  it("sends month_id when a month is picked", async () => {
    const requests = mockApi();
    const user = userEvent.setup();
    render();
    await screen.findByTestId("member-row-1");
    const stepper = screen.getByRole("group", { name: "Month" });
    await waitFor(() => expect(within(stepper).getByRole("button", { name: "Next month" })).toBeEnabled());
    await user.click(within(stepper).getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(requests.at(-1)).toBe("?month_id=2"));
  });

  it("starts on the month passed in the link", async () => {
    const requests = mockApi();
    render({ initialMonthId: 2 });
    await screen.findByTestId("member-row-1");
    expect(requests[0]).toBe("?month_id=2");
  });

  it("renders in Bangla with Bangla digits", async () => {
    mockApi();
    render({}, "bn");
    expect(screen.getByRole("heading", { name: "মেসের ওভারভিউ" })).toBeInTheDocument();
    expect(await screen.findByTestId("stat-fixed-bills")).toHaveTextContent("৮,৪০০");
    expect(screen.getAllByText(/বকেয়া/).length).toBeGreaterThan(0);
    expectBanglaOnly(["X"]);
  });

  it("shows an error state when the dashboard cannot load", async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
      http.get(`${BASE}/history`, () => HttpResponse.json({ data: history })),
      http.get(`${BASE}/dashboard`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
    );
    render();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the dashboard");
  });

  it("shows a friendly message for an unknown month", async () => {
    server.use(
      http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
      http.get(`${BASE}/history`, () => HttpResponse.json({ data: history })),
      http.get(`${BASE}/dashboard`, () => HttpResponse.json({ message: "Not found" }, { status: 404 })),
    );
    render({ initialMonthId: 99 });
    expect(await screen.findByRole("alert")).toHaveTextContent("That month was not found.");
  });
});

describe("StaffDashboard charts", () => {
  it("sums approved expenses per category, largest first, for the viewed month", async () => {
    spendRequests.length = 0;
    mockApi();
    render();
    const chart = await screen.findByTestId("chart-spending");
    await within(chart).findByTestId("bar-5");
    const rows = within(chart).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Fish");
    expect(rows[0]).toHaveTextContent("৳1,500.00");
    expect(rows[1]).toHaveTextContent("Gas");
    expect(rows[1]).toHaveTextContent("৳200.00");
    const params = new URLSearchParams(spendRequests[0]);
    expect(params.get("month_id")).toBe("1");
    expect(params.get("status")).toBe("approved");
  });

  it("has a table fallback for spending", async () => {
    mockApi();
    const user = userEvent.setup();
    render();
    const chart = await screen.findByTestId("chart-spending");
    await within(chart).findByTestId("bar-5");
    await user.click(within(chart).getByRole("button", { name: "Show as table" }));
    const table = within(chart).getByRole("table");
    expect(within(table).getByRole("rowheader", { name: "Gas" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "৳1,500.00" })).toBeInTheDocument();
  });

  it("shows an empty state when nothing is approved", async () => {
    mockApi(dashboard, []);
    render();
    const chart = await screen.findByTestId("chart-spending");
    expect(await within(chart).findByText("No approved expenses this month.")).toBeInTheDocument();
  });

  it("charts member balances (most due first) and skips archived members with zero balance", async () => {
    const archivedZero: DashboardRow = { ...credit, member_id: 9, display_name: "Old Timer", balance_paisa: 0, is_archived: true };
    mockApi({ ...dashboard, members: [...dashboard.members, archivedZero] });
    render();
    const chart = await screen.findByTestId("chart-balances");
    const rows = within(chart).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["dbar-1", "dbar-3", "dbar-2"]);
    expect(rows[0]).toHaveTextContent("Due ৳1,600.00");
    expect(rows[2]).toHaveTextContent("Credit ৳700.00");
    expect(rows[0].querySelector(".bg-danger")).not.toBeNull();
    expect(rows[2].querySelector(".bg-success")).not.toBeNull();
    expect(within(chart).queryByText("Old Timer")).toBeNull();
  });

  it("renders both charts in Bangla", async () => {
    mockApi();
    render({}, "bn");
    const spending = await screen.findByTestId("chart-spending");
    await within(spending).findByTestId("bar-5");
    expect(within(spending).getByText("ক্যাটাগরি অনুযায়ী খরচ")).toBeInTheDocument();
    expect(screen.getByTestId("chart-balances")).toHaveTextContent("পাওনা ৳৭০০");
    expectBanglaOnly(["X"]);
  });
});
