import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Member, Mess, Month, Payment } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { PaymentsPage } from "./payments-page";

const BASE = `${API_BASE_URL}/api/messes/7`;

const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals", manager_member_id: 1 } as Mess;
const member = (id: number, name: string, extra: Partial<Member> = {}): Member => ({
  id, display_name: name, user_id: id, has_account: true, is_admin: false, is_manager: id === 1,
  joined_on: "2026-01-01", left_on: null, archived_at: null, ...extra,
});
const members = [member(1, "Rahim"), member(2, "Karim"), member(3, "Old Timer", { archived_at: "2026-05-01T00:00:00Z" })];
const nov: Month = { id: 11, starts_on: "2026-11-01", ends_on: "2026-11-30", status: "open", fixed_deadline: null, deposit_deadline: null, deposit_paisa: 0, zero_meal_resolution: null, closed_at: null };
const oct: Month = { ...nov, id: 10, starts_on: "2026-10-01", ends_on: "2026-10-31", status: "closed" };
const pay = (id: number, member_id: number, group: Payment["group"], amount_paisa: number, extra: Partial<Payment> = {}): Payment => ({
  id, month_id: 11, member_id, group, amount_paisa, paid_on: "2026-11-02", note: null, received_by_member_id: 1, ...extra,
});

function mockApi({ manager = true, payments = [pay(1, 2, "fixed", 150000, { note: "Rent share" }), pay(2, 2, "meals", 52150)] } = {}) {
  const requests: string[] = [];
  server.use(
    http.get(BASE, () => HttpResponse.json({ data: { mess, me: member(manager ? 1 : 2, manager ? "Rahim" : "Karim", { is_manager: manager }) } })),
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
    http.get(`${BASE}/months`, () => HttpResponse.json({ data: [nov, oct] })),
    http.get(`${BASE}/months/current`, () => HttpResponse.json({ data: nov })),
    http.get(`${BASE}/cash`, () => HttpResponse.json({ data: { pool_balance_paisa: 1234500, manager_member_id: 1 } })),
    http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${BASE}/payments`, ({ request }) => {
      requests.push(new URL(request.url).search);
      return HttpResponse.json({ data: payments });
    }),
  );
  return requests;
}

const renderPage = () => renderWithProviders(<PaymentsPage />, { messId: 7 });

describe("PaymentsPage", () => {
  it("lists the current month's payments with totals and the cash in the manager's hand", async () => {
    const requests = mockApi();
    renderPage();
    expect(await screen.findByText("Rent share")).toBeInTheDocument();
    expect(screen.getAllByText("Karim").length).toBeGreaterThan(0);
    expect(screen.getAllByText("৳1,500.00").length).toBe(2);
    expect(screen.getAllByText("৳521.50").length).toBe(2);
    expect(within(screen.getByTestId("total-fixed")).getByText("৳1,500.00")).toBeInTheDocument();
    expect(within(screen.getByTestId("total-meals")).getByText("৳521.50")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("cash-pool")).toHaveTextContent("৳12,345.00"));
    expect(screen.getAllByText("Received by Rahim").length).toBe(2);
    expect(requests[0]).toContain("month_id=11");
    expect(requests[0]).not.toContain("member_id");
  });

  it("filters by member and switches month", async () => {
    const requests = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Rent share");
    await user.selectOptions(screen.getByLabelText("Filter by member"), "Karim");
    await waitFor(() => expect(requests.at(-1)).toContain("member_id=2"));
    await user.selectOptions(screen.getByLabelText("Month"), "10");
    await waitFor(() => expect(requests.at(-1)).toContain("month_id=10"));
  });

  it("hides the member filter and labels the cash for a normal member", async () => {
    mockApi({ manager: false });
    renderPage();
    await screen.findByText("Rent share");
    expect(screen.queryByLabelText("Filter by member")).toBeNull();
    expect(screen.getByText("Cash in manager's hand")).toBeInTheDocument();
    expect(screen.getByLabelText("Month")).toBeInTheDocument();
  });

  it("records a payment (manager happy path)", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/payments`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: pay(9, 2, "meals", 52150) }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await screen.findByRole("form");
    expect(within(screen.getByRole("form")).queryByRole("option", { name: "Old Timer" })).toBeNull();
    await user.selectOptions(within(screen.getByRole("form")).getByLabelText("Member"), "Karim");
    await user.selectOptions(screen.getByLabelText("Pays for"), "meals");
    await user.type(screen.getByLabelText("Amount (taka)"), "521.5");
    fireEvent.change(screen.getByLabelText("Date received"), { target: { value: "2026-11-03" } });
    await user.type(screen.getByLabelText("Note (optional)"), "bKash");
    await user.click(screen.getByRole("button", { name: "Save payment" }));

    await waitFor(() => expect(body).toEqual({ member_id: 2, group: "meals", amount_paisa: 52150, paid_on: "2026-11-03", note: "bKash" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save payment" })).toBeNull());
  });

  it("rejects a bad amount client-side without calling the API", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await user.selectOptions(within(screen.getByRole("form")).getByLabelText("Member"), "Karim");
    await user.type(screen.getByLabelText("Amount (taka)"), "1.234");
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    expect(await screen.findByText(/Enter taka like 1,000/)).toBeInTheDocument();
  });

  it("shows 422 field errors from the server", async () => {
    mockApi();
    server.use(
      http.post(`${BASE}/payments`, () =>
        HttpResponse.json({ message: "invalid", errors: { paid_on: ["No month covers that date."] } }, { status: 422 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await user.selectOptions(within(screen.getByRole("form")).getByLabelText("Member"), "Karim");
    await user.type(screen.getByLabelText("Amount (taka)"), "100");
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    expect(await screen.findByText("No month covers that date.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date received")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a clear message on 409 month_closed", async () => {
    mockApi();
    server.use(http.post(`${BASE}/payments`, () => HttpResponse.json({ message: "This month is closed.", code: "month_closed" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Record payment" }));
    await user.selectOptions(within(screen.getByRole("form")).getByLabelText("Member"), "Karim");
    await user.type(screen.getByLabelText("Amount (taka)"), "100");
    await user.click(screen.getByRole("button", { name: "Save payment" }));
    expect(await screen.findByText(/That month is closed/)).toBeInTheDocument();
  });

  it("edits a payment", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.patch(`${BASE}/payments/1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: pay(1, 2, "fixed", 200000) });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Rent share");
    await user.click(screen.getAllByRole("button", { name: "Edit: Karim" })[0]);
    const amount = screen.getByLabelText("Amount (taka)");
    expect(amount).toHaveValue("1500");
    await user.clear(amount);
    await user.type(amount, "2,000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(body).toMatchObject({ member_id: 2, amount_paisa: 200000, note: "Rent share" }));
  });

  it("deletes after confirmation and reports a closed month", async () => {
    mockApi();
    server.use(http.delete(`${BASE}/payments/1`, () => HttpResponse.json({ message: "closed", code: "month_closed" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Rent share");
    await user.click(screen.getAllByRole("button", { name: "Delete: Karim" })[0]);
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText(/That month is closed/)).toBeInTheDocument();
  });

  it("hides every manager control for a plain member", async () => {
    mockApi({ manager: false });
    renderPage();
    await screen.findByText("Rent share");
    expect(screen.queryByRole("button", { name: "Record payment" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete/ })).toBeNull();
  });

  it("hides edit and delete for a closed month", async () => {
    mockApi({ payments: [pay(5, 2, "fixed", 1000, { month_id: 10 })] });
    server.use(http.get(`${BASE}/months/current`, () => HttpResponse.json({ data: oct })));
    renderPage();
    await screen.findByText("Fixed bills", { selector: "p.text-sm.text-muted", exact: false });
    await screen.findAllByText("৳10.00");
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });

  it("renders Bangla", async () => {
    mockApi();
    renderWithProviders(<PaymentsPage />, { messId: 7, locale: "bn" });
    expect(await screen.findByText("এই মাসের পেমেন্ট", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("cash-pool")).toHaveTextContent("৳১২,৩৪৫.০০"));
    expectBanglaOnly([]);
  });
});
