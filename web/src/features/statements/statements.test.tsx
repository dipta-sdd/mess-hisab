import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import HistoryFx from "../../../../docs/contract-fixtures/History.json";
import StatementFx from "../../../../docs/contract-fixtures/Statement.json";
import type { HistoryRow, Member, Mess, Statement } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { HistoryPage } from "./history-page";
import { StatementPage } from "./statement-page";

const BASE = `${API_BASE_URL}/api/messes/7`;
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

function mockApi(data: Statement = statement) {
  const requests: string[] = [];
  server.use(
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

    const all = screen.getAllByTestId(/^line-/).map((n) => n.getAttribute("data-testid"));
    expect(all).toEqual(["line-carry_in", "line-payment", "line-fixed_bill", "line-meal_charge", "line-own_pocket_expense"]);
    // carry_in appears once (not duplicated from lines)
    expect(all.filter((k) => k === "line-carry_in").length).toBe(1);

    const fixed = screen.getByTestId("section-fixed");
    expect(within(fixed).getByText("Rent")).toBeInTheDocument();
    expect(within(fixed).getByText("Payment")).toBeInTheDocument();
    const meals = screen.getByTestId("section-meals");
    expect(within(meals).getByText("Meal charge")).toBeInTheDocument();
    expect(within(meals).getByText("Paid from own pocket")).toBeInTheDocument();
    expect(within(meals).getByText("Paid from pocket: rice")).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByLabelText("Month")).toHaveValue("1"));
    await user.selectOptions(screen.getByLabelText("Month"), "2");
    await waitFor(() => expect(requests.at(-1)).toBe("2?month_id=2"));
    await user.selectOptions(screen.getByLabelText("Member"), "X");
    await waitFor(() => expect(requests.at(-1)).toBe("1?month_id=2"));
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
