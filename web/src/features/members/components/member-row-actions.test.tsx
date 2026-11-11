import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dashboard, DashboardRow, Member } from "@/lib/api/contract";
import { API_BASE_URL, resetApiClientState } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import dashboardFixture from "../../../../../docs/contract-fixtures/Dashboard.json";
import settlementFixture from "../../../../../docs/contract-fixtures/SettlementResult.json";
import { MemberRowActions } from "./member-row-actions";

vi.mock("@/lib/nav", async (orig) => ({ ...(await orig<object>()), useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const BASE = `${API_BASE_URL}/api/messes/3`;
const member = (over: Partial<Member> & { id: number; display_name: string }): Member => ({
  user_id: null, has_account: false, is_admin: false, is_manager: false, joined_on: "2026-10-01", left_on: null, archived_at: null, ...over,
});
const karim = member({ id: 2, display_name: "Karim", has_account: true, user_id: 2 });
const manager = member({ id: 1, display_name: "Rina", has_account: true, user_id: 1, is_manager: true });
const plain = member({ id: 5, display_name: "Salma", has_account: true, user_id: 5 });

const row = (member_id: number, balance_paisa: number): DashboardRow => ({
  ...(dashboardFixture.members[0] as DashboardRow), member_id, display_name: "X", balance_paisa,
});
const dashboard = (rows: DashboardRow[], cash: number): Dashboard => ({ ...(dashboardFixture as Dashboard), cash_pool_paisa: cash, members: rows });

function serve(me: Member, dash: Dashboard) {
  server.use(
    http.get(BASE, () => HttpResponse.json({ data: { mess: { id: 3, name: "Green" }, me } })),
    http.get(`${BASE}/dashboard`, () => HttpResponse.json({ data: dash })),
  );
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Final settlement for Karim" }));
  return screen.findByRole("dialog");
};

const openMenu = async (name = "Karim") => {
  await userEvent.click(await screen.findByRole("button", { name: `More actions for ${name}` }));
};

beforeEach(() => {
  resetApiClientState();
  document.cookie = "XSRF-TOKEN=t; path=/";
});

describe("MemberRowActions final settlement", () => {
  it("keeps the existing edit and archive actions", async () => {
    serve(manager, dashboard([row(2, 100000)], 500000));
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Edit Karim" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Archive Karim" })).toBeInTheDocument();
  });

  it("prefills min(credit, cash) when cash is lower, and shows balance and cash pool", async () => {
    serve(manager, dashboard([row(2, 150000)], 90050));
    const user = userEvent.setup();
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await open(user);
    expect(screen.getByTestId("settlement-credit")).toHaveTextContent("৳1,500.00");
    expect(screen.getByTestId("settlement-cash")).toHaveTextContent("৳900.50");
    expect(screen.getByLabelText("Amount (taka)")).toHaveValue("900.5");
  });

  it("prefills the credit when cash is higher", async () => {
    serve(manager, dashboard([row(2, 150000)], 900000));
    const user = userEvent.setup();
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await open(user);
    expect(screen.getByLabelText("Amount (taka)")).toHaveValue("1500");
  });

  it("posts the amount in paisa and shows the result with an archive hint", async () => {
    serve(manager, dashboard([row(2, 150000)], 350000));
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/members/2/final-settlement`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...settlementFixture, member_id: 2, amount_paisa: 100050, credit_after_paisa: 49950, cash_pool_paisa: 249950 } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await open(user);
    const amount = screen.getByLabelText("Amount (taka)");
    await user.clear(amount);
    await user.type(amount, "1,000.5");
    await user.click(screen.getByRole("button", { name: "Pay out" }));
    await waitFor(() => expect(body).toEqual({ amount_paisa: 100050, paid_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    expect(await screen.findByText("Paid ৳1,000.50 to Karim.")).toBeInTheDocument();
    expect(screen.getByText("Credit left: ৳499.50")).toBeInTheDocument();
    expect(screen.getByText("Cash in manager's hand now: ৳2,499.50")).toBeInTheDocument();
    expect(screen.getByText(/can now archive this member/)).toBeInTheDocument();
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Archive Karim" })).toBeInTheDocument();
  });

  it("rejects a bad amount without calling the API", async () => {
    serve(manager, dashboard([row(2, 150000)], 350000));
    const user = userEvent.setup();
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await open(user);
    const amount = screen.getByLabelText("Amount (taka)");
    await user.clear(amount);
    await user.type(amount, "1.234");
    await user.click(screen.getByRole("button", { name: "Pay out" }));
    expect(await screen.findByText(/Enter taka like/)).toBeInTheDocument();
  });

  it("explains a 409 exceeds_credit with the returned limit", async () => {
    serve(manager, dashboard([row(2, 150000)], 350000));
    server.use(
      http.post(`${BASE}/members/2/final-settlement`, () =>
        HttpResponse.json({ message: "more", code: "exceeds_credit", credit_paisa: 120000 }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await open(user);
    await user.click(screen.getByRole("button", { name: "Pay out" }));
    expect(await screen.findByText("That is more than they are owed. The most you can pay is ৳1,200.00.")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-credit")).toHaveTextContent("৳1,200.00");
  });

  it("explains a 409 exceeds_cash with the returned limit", async () => {
    serve(manager, dashboard([row(2, 150000)], 350000));
    server.use(
      http.post(`${BASE}/members/2/final-settlement`, () =>
        HttpResponse.json({ message: "cash", code: "exceeds_cash", cash_paisa: 40000 }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await open(user);
    await user.click(screen.getByRole("button", { name: "Pay out" }));
    expect(await screen.findByText("The cash pool does not have that much. The most available is ৳400.00.")).toBeInTheDocument();
    expect(screen.getByTestId("settlement-cash")).toHaveTextContent("৳400.00");
  });

  it("is hidden for a member with no credit", async () => {
    serve(manager, dashboard([row(2, -5000)], 350000));
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Edit Karim" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: /Final settlement/ })).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /Final settlement/ })).toBeNull();
  });

  it("is hidden for non-managers (and requests no dashboard)", async () => {
    let dashboardCalls = 0;
    server.use(
      http.get(BASE, () => HttpResponse.json({ data: { mess: { id: 3, name: "Green" }, me: plain } })),
      http.get(`${BASE}/dashboard`, () => {
        dashboardCalls += 1;
        return HttpResponse.json({ data: dashboard([row(2, 100000)], 500000) });
      }),
    );
    const { container } = renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
    expect(dashboardCalls).toBe(0);
  });

  it("is hidden for an admin who is not the manager (the API allows only the manager)", async () => {
    const admin = member({ id: 7, display_name: "Adil", has_account: true, user_id: 7, is_admin: true });
    let dashboardCalls = 0;
    server.use(
      http.get(BASE, () => HttpResponse.json({ data: { mess: { id: 3, name: "Green" }, me: admin } })),
      http.get(`${BASE}/dashboard`, () => {
        dashboardCalls += 1;
        return HttpResponse.json({ data: dashboard([row(2, 100000)], 500000) });
      }),
    );
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3 });
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: "Edit Karim" })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /Final settlement/ })).toBeNull();
    expect(dashboardCalls).toBe(0);
  });
});

describe("MemberRowActions final settlement (Bangla)", () => {
  it("renders the dialog in Bangla with Bangla digits and no leftover English", async () => {
    serve(manager, dashboard([row(2, 150000)], 90050));
    const user = userEvent.setup();
    renderWithProviders(<MemberRowActions member={karim} />, { messId: 3, locale: "bn" });
    await user.click(await screen.findByRole("button", { name: "Karim-এর ফাইনাল হিসাব" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("settlement-credit")).toHaveTextContent("৳১,৫০০.০০");
    expect(within(dialog).getByTestId("settlement-cash")).toHaveTextContent("৳৯০০.৫০");
    const text = (dialog.textContent ?? "").replaceAll("Karim", "");
    expect(text).not.toMatch(/[A-Za-z]/);
    expect(text).not.toMatch(/[0-9]/);
  });
});
