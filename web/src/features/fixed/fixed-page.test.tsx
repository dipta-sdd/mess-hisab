import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Bill, Member, Mess, Month } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { FixedPage } from "./fixed-page";

const BASE = `${API_BASE_URL}/api/messes/7`;

const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals", manager_member_id: 1, meal_tracking: "daily_number", meal_entry_by: "manager" } as Mess;
const member = (id: number, name: string): Member => ({
  id, display_name: name, user_id: id, has_account: true, is_admin: false, is_manager: id === 1,
  joined_on: "2026-01-01", left_on: null, archived_at: null,
});
const members = [member(1, "Rahim"), member(2, "Karim")];
const nov: Month = { id: 11, starts_on: "2026-11-01", ends_on: "2026-11-30", status: "open", fixed_deadline: null, deposit_deadline: null, deposit_paisa: 100000, zero_meal_resolution: null, closed_at: null };
const oct: Month = { ...nov, id: 10, starts_on: "2026-10-01", ends_on: "2026-10-31", status: "closed" };

const rent = (extra: Partial<Bill> = {}): Bill =>
  ({
    category_id: 1, group: "fixed", split_type: "equal", amount_paisa: 1000000, overrides: [],
    shares: { "1": 500000, "2": 500000 }, unallocated_paisa: 0, unallocated_accepted: false, ...extra,
  }) as Bill;
const food = (): Bill =>
  ({ category_id: 2, group: "meals", split_type: "by_meal", amount_paisa: 0, overrides: [], shares: {}, unallocated_paisa: 0, unallocated_accepted: false }) as Bill;

function mockApi({ manager = true, current = nov, bills = [rent(), food()] }: { manager?: boolean; current?: Month; bills?: Bill[] } = {}) {
  server.use(
    http.get(BASE, () => HttpResponse.json({ data: { mess, me: { ...member(manager ? 1 : 2, manager ? "Rahim" : "Karim"), is_manager: manager } } })),
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
    http.get(`${BASE}/months`, () => HttpResponse.json({ data: [nov, oct] })),
    http.get(`${BASE}/months/current`, () => HttpResponse.json({ data: current })),
    http.get(`${BASE}/categories`, () =>
      HttpResponse.json({ data: [{ id: 1, name: "Rent" }, { id: 2, name: "Food" }] }),
    ),
    http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${BASE}/months/${current.id}/setup`, () =>
      HttpResponse.json({
        data: {
          month: current,
          bills,
          member_settings: [{ member_id: 2, deposit_paisa: 250000, min_meals_centi: 1250 }],
        },
      }),
    ),
  );
}

const renderPage = () => renderWithProviders(<FixedPage />, { messId: 7 });

describe("FixedPage (manager)", () => {
  it("shows bills with server shares and hides by-meal categories", async () => {
    mockApi();
    renderPage();
    expect(await screen.findByRole("heading", { name: "Rent" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Food" })).toBeNull();
    expect(screen.getByTestId("share-1-1")).toHaveTextContent("5,000");
    expect(screen.getByTestId("share-1-2")).toHaveTextContent("5,000");
    expect(screen.getByLabelText("Bill amount (taka)")).toHaveValue("10000");
  });

  it("saves the amount and overrides in integer paisa", async () => {
    mockApi();
    let body: unknown = null;
    server.use(http.put(`${BASE}/months/11/bills/1`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: rent() }); }));
    const user = userEvent.setup();
    renderPage();
    const amount = await screen.findByLabelText("Bill amount (taka)");
    await user.clear(amount);
    await user.type(amount, "12,000.50");
    await user.type(screen.getByLabelText("Set by hand (taka): Karim"), "3000.25");
    await user.click(screen.getByRole("button", { name: "Save bill: Rent" }));
    await waitFor(() =>
      expect(body).toEqual({ amount_paisa: 1200050, overrides: [{ member_id: 2, amount_paisa: 300025 }] }),
    );
  });

  it("rejects a bad amount without calling the API", async () => {
    mockApi();
    let called = false;
    server.use(http.put(`${BASE}/months/11/bills/1`, () => { called = true; return HttpResponse.json({ data: rent() }); }));
    const user = userEvent.setup();
    renderPage();
    const amount = await screen.findByLabelText("Bill amount (taka)");
    await user.clear(amount);
    await user.type(amount, "12.345");
    await user.click(screen.getByRole("button", { name: "Save bill: Rent" }));
    expect(await screen.findByText(/Enter taka like 1,000 or 521\.50/)).toBeInTheDocument();
    expect(amount).toHaveAttribute("aria-invalid", "true");
    expect(called).toBe(false);
  });

  it("shows the unallocated line and calls spread", async () => {
    mockApi({ bills: [rent({ unallocated_paisa: 200000, overrides: [{ member_id: 1, amount_paisa: 300000 }] })] });
    let spread = 0;
    server.use(http.post(`${BASE}/months/11/bills/1/spread`, () => { spread += 1; return HttpResponse.json({ data: rent() }); }));
    const user = userEvent.setup();
    renderPage();
    const box = await screen.findByTestId("unallocated-1");
    expect(box).toHaveTextContent("Unallocated");
    expect(box).toHaveTextContent("2,000");
    await user.click(screen.getByRole("button", { name: "Spread: Rent" }));
    await waitFor(() => expect(spread).toBe(1));
  });

  it("calls accept", async () => {
    mockApi({ bills: [rent({ unallocated_paisa: 50000 })] });
    let accepted = 0;
    server.use(http.post(`${BASE}/months/11/bills/1/accept`, () => { accepted += 1; return HttpResponse.json({ data: rent() }); }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Accept: Rent" }));
    await waitFor(() => expect(accepted).toBe(1));
  });

  it("offers no spread when over-allocated", async () => {
    mockApi({ bills: [rent({ unallocated_paisa: -50000 })] });
    renderPage();
    expect(await screen.findByTestId("unallocated-1")).toHaveTextContent("Over-allocated by");
    expect(screen.queryByRole("button", { name: "Spread: Rent" })).toBeNull();
  });

  it.each([
    ["spread", "nothing_to_spread", /Nothing is left unallocated/],
    ["spread", "amount_required", /Enter the bill's amount first/],
    ["accept", "category_archived", /archived/],
    ["spread", "month_closed", /That month is closed/],
  ])("shows a friendly message for 409 on %s: %s", async (action, code, text) => {
    mockApi({ bills: [rent({ unallocated_paisa: 50000 })] });
    server.use(http.post(`${BASE}/months/11/bills/1/${action}`, () => HttpResponse.json({ message: "server words", code }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: `${action === "spread" ? "Spread" : "Accept"}: Rent` }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText("server words")).toBeNull();
  });

  it("shows the over_allocated message when saving a bill", async () => {
    mockApi();
    server.use(http.put(`${BASE}/months/11/bills/1`, () => HttpResponse.json({ message: "x", code: "over_allocated" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("Set by hand (taka): Karim"), "99999");
    await user.click(screen.getByRole("button", { name: "Save bill: Rent" }));
    expect(await screen.findByText(/Too much is allocated/)).toBeInTheDocument();
  });

  it("patches deadlines and the default deposit, only changed fields", async () => {
    mockApi();
    let body: unknown = null;
    server.use(http.patch(`${BASE}/months/11/setup`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: nov }); }));
    const user = userEvent.setup();
    renderPage();
    const deposit = await screen.findByLabelText("Deposit per member (taka)");
    await user.clear(deposit);
    await user.type(deposit, "1500");
    await user.type(screen.getByLabelText("Fixed bills deadline"), "2026-11-10");
    await user.click(screen.getByRole("button", { name: "Save deadlines and deposit" }));
    await waitFor(() => expect(body).toEqual({ fixed_deadline: "2026-11-10", deposit_paisa: 150000 }));
  });

  it("saves per-member deposit and minimum meals", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.put(`${BASE}/months/11/members/1/settings`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { member_id: 1, deposit_paisa: 200000, min_meals_centi: 2050 } });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByLabelText("Deposit (taka): Karim")).toHaveValue("2500");
    expect(screen.getByLabelText("Minimum meals: Karim")).toHaveValue("12.5");
    await user.type(screen.getByLabelText("Deposit (taka): Rahim"), "2000");
    await user.type(screen.getByLabelText("Minimum meals: Rahim"), "20.5");
    await user.click(screen.getByRole("button", { name: "Save: Rahim" }));
    await waitFor(() => expect(body).toEqual({ deposit_paisa: 200000, min_meals_centi: 2050 }));
  });
});

describe("FixedPage (read-only)", () => {
  it("a plain member sees the setup but cannot edit", async () => {
    mockApi({ manager: false, bills: [rent({ unallocated_paisa: 50000 })] });
    renderPage();
    expect(await screen.findByTestId("readonly-note")).toBeInTheDocument();
    expect(screen.getByTestId("share-1-1")).toHaveTextContent("5,000");
    expect(screen.getByTestId("unallocated-1")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Spread|Accept|Save/ })).toBeNull();
    expect(screen.getByTestId("month-setup-readonly")).toBeInTheDocument();
  });

  it("a closed month is read-only even for the manager", async () => {
    mockApi({ current: oct });
    renderPage();
    expect(await screen.findByTestId("closed-note")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  });

  it("renders Bangla", async () => {
    mockApi();
    renderWithProviders(<FixedPage />, { messId: 7, locale: "bn" });
    expect(await screen.findByRole("heading", { name: "ফিক্সড বিল সেটআপ" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "বিল সেভ করুন: Rent" })).toBeInTheDocument();
  });
});
