import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import DashboardFx from "../../../../docs/contract-fixtures/Dashboard.json";
import type { Dashboard, DashboardRow, HistoryRow, Mess } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { MemberDashboard } from "./member-dashboard";

const BASE = `${API_BASE_URL}/api/messes/7`;
const fixture = DashboardFx as Dashboard;
const owing: DashboardRow = { ...fixture.members[0], member_id: 2, display_name: "Karim", carry_in_paisa: 0, fixed_balance_paisa: -160000, meals_balance_paisa: 0 };
const credit: DashboardRow = {
  ...owing, balance_paisa: 70000, fixed_balance_paisa: 70000, fixed_outstanding_paisa: 0, carry_in_paisa: 20000, paid_paisa: 50000,
};
const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals" } as Mess;

function mockApi(row: DashboardRow) {
  const data: Dashboard = { ...fixture, members: [row], manager_balance_paisa: null, cash_pool_paisa: 123400 };
  server.use(
    http.get(BASE, () => HttpResponse.json({ data: { mess, me: {} } })),
    http.get(`${BASE}/history`, () => HttpResponse.json({ data: [] as HistoryRow[] })),
    http.get(`${BASE}/dashboard`, () => HttpResponse.json({ data })),
  );
}
const render = (locale: "en" | "bn" = "en") => renderWithProviders(<MemberDashboard memberId={2} />, { messId: 7, locale });

describe("MemberDashboard", () => {
  it("shows what you owe, the fixed deadline and the breakdown", async () => {
    mockApi(owing);
    render();
    const headline = await screen.findByTestId("balance-headline");
    expect(headline).toHaveTextContent("You owe ৳1,600.00");
    expect(headline).toHaveClass("text-danger");
    expect(screen.getByTestId("pay-fixed")).toHaveTextContent("Pay ৳1,600.00 for fixed by 10 Nov 2026");
    expect(screen.getByTestId("line-meals")).toHaveTextContent("20");
    expect(screen.getByTestId("line-meal-bill")).toHaveTextContent("20 meals × ৳40.00");
    expect(screen.getByTestId("line-meal-bill")).toHaveTextContent("৳800.00");
    expect(screen.getByTestId("line-fixed-bill")).toHaveTextContent("৳2,300.00");
    expect(screen.queryByTestId("line-carry")).toBeNull();
    expect(screen.getByRole("link", { name: "See my full statement" })).toHaveAttribute("href", "/7/statements/2?month=1");
    expect(within(screen.getByTestId("mini-cash")).getByText("৳1,234.00")).toBeInTheDocument();
    expect(screen.getByTestId("mini-meal-rate")).toHaveTextContent("৳40.00");
    expect(screen.getByTestId("mini-bazar")).toHaveTextContent("৳2,000.00");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("does not subtract the meals balance from what is owed while the month is open", async () => {
    mockApi({ ...owing, meals_balance_paisa: 33300, balance_paisa: -126700 });
    render();
    expect(await screen.findByTestId("balance-headline")).toHaveTextContent("You owe ৳1,600.00");
    expect(screen.getByTestId("meals-pending")).toHaveTextContent("৳333.00 credit, added when the month closes");
  });

  it("labels a negative carry-in as last month's due", async () => {
    mockApi({ ...owing, carry_in_paisa: -141100 });
    render();
    expect(await screen.findByTestId("line-carry")).toHaveTextContent("Last month due");
    expect(screen.getByTestId("line-carry")).toHaveTextContent("৳1,411.00");
  });

  it("shows what you get back, last month's credit and the payment", async () => {
    mockApi(credit);
    render();
    const headline = await screen.findByTestId("balance-headline");
    expect(headline).toHaveTextContent("You get back ৳700.00");
    expect(headline).toHaveClass("text-success");
    expect(screen.queryByTestId("pay-fixed")).toBeNull();
    expect(screen.getByTestId("line-carry")).toHaveTextContent("Last month credit");
    expect(screen.getByTestId("line-paid")).toHaveTextContent("৳500.00");
  });

  it("says all settled at zero", async () => {
    mockApi({ ...credit, balance_paisa: 0, fixed_balance_paisa: 0 });
    render();
    expect(await screen.findByTestId("balance-headline")).toHaveTextContent("All settled");
  });

  it("renders in Bangla when owing", async () => {
    mockApi(owing);
    render("bn");
    expect(await screen.findByTestId("balance-headline")).toHaveTextContent("আপনার বকেয়া ৳১,৬০০");
    expect(screen.getByTestId("pay-fixed")).toHaveTextContent("ফিক্সড বিলের জন্য");
    expect(screen.getByTestId("mini-cash")).toHaveTextContent("ম্যানেজারের হাতে ক্যাশ");
    expectBanglaOnly(["Karim"]);
  });

  it("renders in Bangla when in credit", async () => {
    mockApi(credit);
    render("bn");
    expect(await screen.findByTestId("balance-headline")).toHaveTextContent("আপনি ফেরত পাবেন ৳৭০০");
    expect(screen.getByTestId("line-carry")).toHaveTextContent("আগের মাসের জমা");
  });
});
