import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import DashboardFx from "../../../../docs/contract-fixtures/Dashboard.json";
import HistoryFx from "../../../../docs/contract-fixtures/History.json";
import type { Dashboard, DashboardRow, HistoryRow, Member, Mess } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { DashboardPage } from "./dashboard-page";

const BASE = `${API_BASE_URL}/api/messes/7`;

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

function mockApi(data: Dashboard = dashboard) {
  const requests: string[] = [];
  server.use(
    http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
    http.get(`${BASE}/history`, () => HttpResponse.json({ data: history })),
    http.get(`${BASE}/dashboard`, ({ request }) => {
      requests.push(new URL(request.url).search);
      return HttpResponse.json({ data });
    }),
  );
  return requests;
}

const render = (props = {}, locale: "en" | "bn" = "en") => renderWithProviders(<DashboardPage {...props} />, { messId: 7, locale });

describe("DashboardPage", () => {
  it("renders totals, cash pool and the manager balance from the server", async () => {
    const requests = mockApi();
    render();
    expect(await screen.findByTestId("stat-fixed-bills")).toHaveTextContent("৳8,400.00");
    expect(screen.getByTestId("stat-meal-rate")).toHaveTextContent("৳40.00");
    expect(screen.getByTestId("stat-total-meals")).toHaveTextContent("50");
    expect(screen.getByTestId("stat-cash-pool")).toHaveTextContent("৳0.00");
    expect(screen.getByTestId("stat-rounding")).toHaveTextContent("৳0.00");
    expect(screen.getByTestId("stat-manager-balance")).toHaveTextContent("Due ৳1,600.00");
    expect(screen.getByTestId("stat-manager-balance")).toHaveTextContent("X's own balance");
    expect(screen.getByTestId("month-status")).toHaveTextContent("Status: Open");
    // default month: month_id is omitted
    expect(requests[0]).toBe("");
  });

  it("shows due and credit per member and links to the statement", async () => {
    mockApi();
    render();
    const row = await screen.findByTestId("member-row-1");
    expect(within(row).getByText("Due ৳1,600.00")).toBeInTheDocument();
    expect(within(row).getByRole("link", { name: "X" })).toHaveAttribute("href", "/7/statements/1?month=1");
    const credited = screen.getByTestId("member-row-2");
    expect(within(credited).getAllByText("Credit ৳700.00").length).toBe(2);
    expect(within(screen.getByTestId("member-card-2")).getByRole("link")).toHaveAttribute("href", "/7/statements/2?month=1");
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
    await waitFor(() => expect(screen.getByLabelText("Month")).toHaveValue("1"));
    await user.selectOptions(screen.getByLabelText("Month"), "2");
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
    expect(screen.getByRole("heading", { name: "ড্যাশবোর্ড" })).toBeInTheDocument();
    expect(await screen.findByTestId("stat-fixed-bills")).toHaveTextContent("৮,৪০০");
    expect(screen.getAllByText(/বকেয়া/).length).toBeGreaterThan(0);
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
