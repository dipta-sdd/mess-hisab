import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import AdjustmentFx from "../../../../docs/contract-fixtures/Adjustment.json";
import CloseCheckFx from "../../../../docs/contract-fixtures/CloseCheck.json";
import RecoverableFx from "../../../../docs/contract-fixtures/Recoverable.json";
import ReopenPreviewFx from "../../../../docs/contract-fixtures/ReopenPreview.json";
import type {
  Adjustment, CloseCheck, DashboardRow, Member, Mess, Month, Recoverable, ReopenPreview,
} from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { MonthsPage } from "./months-page";

const BASE = `${API_BASE_URL}/api/messes/7`;

const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals", manager_member_id: 1 } as Mess;
const member = (id: number, name: string, extra: Partial<Member> = {}): Member => ({
  id, display_name: name, user_id: id, has_account: true, is_admin: false, is_manager: id === 1,
  joined_on: "2026-01-01", left_on: null, archived_at: null, ...extra,
});
const members = [
  member(1, "Rahim"), member(2, "Karim"), member(3, "Salam"),
  member(4, "Jamal", { archived_at: "2026-10-20T10:00:00+06:00", left_on: "2026-10-20" }),
];
const nov: Month = { id: 11, starts_on: "2026-11-01", ends_on: "2026-11-30", status: "open", fixed_deadline: null, deposit_deadline: null, deposit_paisa: 0, zero_meal_resolution: null, closed_at: null };
const oct: Month = { ...nov, id: 10, starts_on: "2026-10-01", ends_on: "2026-10-31", status: "closed", closed_at: "2026-11-01T09:00:00+06:00" };
const sep: Month = { ...nov, id: 9, starts_on: "2026-09-01", ends_on: "2026-09-30", status: "closed", closed_at: "2026-10-01T09:00:00+06:00" };

const row = (id: number, name: string, balance: number): DashboardRow =>
  ({
    member_id: id, display_name: name, is_archived: false, is_active: true, meals_centi: 0, effective_meals_centi: 0,
    carry_in_paisa: 0, fixed_bill_paisa: 0, meals_bill_paisa: 0, paid_paisa: 0, fixed_balance_paisa: 0,
    meals_balance_paisa: 0, balance_paisa: balance, fixed_outstanding_paisa: 0, deposit_required_paisa: 0,
    deposit_outstanding_paisa: 0, fixed_overdue_days: 0, deposit_overdue_days: 0,
  }) as DashboardRow;
// Salam owes 300.00 (negative balance = due).
const dashboardRows = [row(1, "Rahim", 50000), row(2, "Karim", 0), row(3, "Salam", -30000)];

const csrf = http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 }));

interface Mocks {
  manager?: boolean;
  months?: Month[];
  recoverables?: Recoverable[];
  pending?: Recoverable[];
  adjustments?: Adjustment[];
}

function mockApi({ manager = true, months = [nov, oct], recoverables = [], pending = [], adjustments = [] }: Mocks = {}) {
  server.use(
    csrf,
    http.get(BASE, () => HttpResponse.json({ data: { mess, me: { ...member(manager ? 1 : 2, manager ? "Rahim" : "Karim"), is_manager: manager } } })),
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
    http.get(`${BASE}/months`, () => HttpResponse.json({ data: months })),
    http.get(`${BASE}/dashboard`, () => HttpResponse.json({ data: { month: nov, members: dashboardRows } })),
    http.get(`${BASE}/recoverables`, ({ request }) =>
      HttpResponse.json({ data: new URL(request.url).searchParams.get("status") === "pending" ? pending : recoverables }),
    ),
    http.get(`${BASE}/adjustments`, () => HttpResponse.json({ data: adjustments })),
  );
}

const renderPage = (opts: Parameters<typeof renderWithProviders>[1] = {}) => renderWithProviders(<MonthsPage />, { messId: 7, ...opts });
const fxRecoverable = RecoverableFx as Recoverable;
const fxAdjustment = AdjustmentFx as Adjustment;

describe("MonthsPage: list", () => {
  it("lists months with their status and shows the selected month", async () => {
    mockApi();
    renderPage();
    const nav = await screen.findByRole("navigation", { name: "Months" });
    expect(within(nav).getByRole("button", { name: /November 2026/ })).toHaveAttribute("aria-current", "true");
    expect(within(nav).getByRole("button", { name: /October 2026/ })).toHaveTextContent("Closed");
    expect(screen.getByRole("heading", { name: "November 2026", level: 2 })).toBeInTheDocument();
  });
});

describe("MonthsPage: close flow", () => {
  async function openCheck(check: (url: URL) => CloseCheck) {
    mockApi();
    server.use(http.get(`${BASE}/months/11/close-check`, ({ request }) => HttpResponse.json({ data: check(new URL(request.url)) })));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Check if the month can be closed" }));
    return user;
  }

  it("renders every block with its data", async () => {
    await openCheck(() => ({
      can_close: false,
      blocks: [
        { code: "pending_expenses", data: { count: 3, expense_ids: [1, 2, 3] } },
        { code: "unallocated", data: { bills: [{ category_id: 1, name: "Rent", unallocated_paisa: 10000 }] } },
        { code: "doesnt_pay_mismatch", data: { doesnt_pay: [{ debtor_member_id: 3, amount_paisa: 30000, shares_paisa: 20000, mismatch_paisa: 10000 }] } },
        { code: "cash_mismatch", data: { actual_paisa: 500000, expected_paisa: 520000, difference_paisa: -20000 } },
        { code: "previous_month_open", data: { month_ids: [10] } },
      ],
    }));

    const pendingBlock = await screen.findByTestId("block-pending_expenses");
    expect(pendingBlock).toHaveTextContent("3 expenses are still waiting for approval");
    expect(within(pendingBlock).getByRole("link", { name: "Go to expenses" })).toHaveAttribute("href", "/7/expenses");

    const unallocated = screen.getByTestId("block-unallocated");
    expect(unallocated).toHaveTextContent("Rent");
    expect(unallocated).toHaveTextContent("100");
    expect(within(unallocated).getByRole("link", { name: "Go to fixed bills" })).toHaveAttribute("href", "/7/fixed");

    const mismatch = screen.getByTestId("block-doesnt_pay_mismatch");
    expect(mismatch).toHaveTextContent("Salam owes");
    expect(mismatch).toHaveTextContent("300");
    expect(mismatch).toHaveTextContent("200");

    const cash = screen.getByTestId("block-cash_mismatch");
    expect(cash).toHaveTextContent("Actual cash");
    expect(cash).toHaveTextContent("5,000");
    expect(cash).toHaveTextContent("5,200");
    expect(cash).toHaveTextContent("200");

    expect(screen.getByTestId("block-previous_month_open")).toHaveTextContent("October 2026");
    expect(screen.queryByRole("button", { name: "Close month" })).toBeNull();
  });

  it("renders the contract fixture's block", async () => {
    await openCheck(() => CloseCheckFx as CloseCheck);
    expect(await screen.findByTestId("block-unallocated")).toHaveTextContent("Rent");
  });

  it("asks for the zero-meal choice and sends it when closing", async () => {
    let closeBody: unknown = null;
    const seen: (string | null)[] = [];
    mockApi();
    server.use(
      http.get(`${BASE}/months/11/close-check`, ({ request }) => {
        const r = new URL(request.url).searchParams.get("zero_meal_resolution");
        seen.push(r);
        return HttpResponse.json({
          data: r ? { can_close: true, blocks: [] } : { can_close: false, blocks: [{ code: "zero_meals_unresolved", data: { food_cost_paisa: 150000 } }] },
        });
      }),
      http.post(`${BASE}/months/11/close`, async ({ request }) => {
        closeBody = await request.json();
        return HttpResponse.json({ data: { ...nov, status: "closed", zero_meal_resolution: "carry" } });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Check if the month can be closed" }));
    expect(await screen.findByTestId("block-zero_meals_unresolved")).toHaveTextContent("1,500");
    expect(screen.queryByRole("button", { name: "Close month" })).toBeNull();

    await user.click(screen.getByRole("radio", { name: /Carry the food cost to next month/ }));
    await user.click(await screen.findByRole("button", { name: "Close month" }));
    expect(seen).toContain("carry");

    const confirm = screen.getByRole("group", { name: "Close this month?" });
    await user.click(within(confirm).getByRole("button", { name: "Yes, close the month" }));
    await waitFor(() => expect(closeBody).toEqual({ zero_meal_resolution: "carry" }));
    expect(await screen.findByText("November 2026 is now closed.")).toBeInTheDocument();
  });

  it("needs a confirmation step before closing", async () => {
    let closed = false;
    mockApi();
    server.use(
      http.get(`${BASE}/months/11/close-check`, () => HttpResponse.json({ data: { can_close: true, blocks: [] } })),
      http.post(`${BASE}/months/11/close`, () => { closed = true; return HttpResponse.json({ data: { ...nov, status: "closed" } }); }),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Check if the month can be closed" }));
    await user.click(await screen.findByRole("button", { name: "Close month" }));
    expect(closed).toBe(false);
    await user.click(screen.getByRole("button", { name: "Not yet" }));
    expect(screen.queryByRole("group", { name: "Close this month?" })).toBeNull();
    expect(closed).toBe(false);
  });

  it("shows the blocks returned by a 409 close_blocked", async () => {
    mockApi();
    server.use(
      http.get(`${BASE}/months/11/close-check`, () => HttpResponse.json({ data: { can_close: true, blocks: [] } })),
      http.post(`${BASE}/months/11/close`, () =>
        HttpResponse.json(
          { message: "blocked", code: "close_blocked", blocks: [{ code: "pending_expenses", data: { count: 1, expense_ids: [5] } }] },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Check if the month can be closed" }));
    await user.click(await screen.findByRole("button", { name: "Close month" }));
    await user.click(screen.getByRole("button", { name: "Yes, close the month" }));
    expect(await screen.findByText(/could not be closed/)).toBeInTheDocument();
    expect(screen.getByTestId("block-pending_expenses")).toHaveTextContent("1 expense is still waiting");
    expect(screen.queryByRole("button", { name: "Close month" })).toBeNull();
  });
});

describe("MonthsPage: reopen flow", () => {
  const preview = (over: Partial<ReopenPreview> = {}): ReopenPreview => ({
    month_id: 10, can_reopen: true, blocks: [], rows_to_delete: 12,
    members: [
      { member_id: 1, display_name: "Rahim", before_paisa: 50000, after_paisa: 40000, change_paisa: -10000 },
      { member_id: 3, display_name: "Salam", before_paisa: -30000, after_paisa: -30000, change_paisa: 0 },
    ],
    next_month: { id: 11, will_be_deleted: true }, ...over,
  });

  async function openPreview(data: ReopenPreview) {
    mockApi();
    server.use(http.get(`${BASE}/months/10/reopen-preview`, () => HttpResponse.json({ data })));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /October 2026/ }));
    await user.click(await screen.findByRole("button", { name: "Review what reopening does" }));
    return user;
  }

  it("shows the before/after table, rows to delete and the next-month note, then reopens after confirming", async () => {
    let reopened = false;
    server.use(http.post(`${BASE}/months/10/reopen`, () => { reopened = true; return HttpResponse.json({ data: { ...oct, status: "open" } }); }));
    const user = await openPreview(preview());

    const table = await screen.findByRole("table");
    const rahim = within(table).getByRole("row", { name: /Rahim/ });
    expect(rahim).toHaveTextContent("500");
    expect(rahim).toHaveTextContent("400");
    expect(rahim).toHaveTextContent("100");
    expect(screen.getByTestId("rows-to-delete")).toHaveTextContent("12 closing records will be deleted");
    expect(screen.getByTestId("next-month-note")).toHaveTextContent("empty, so it will be removed");

    await user.click(screen.getByRole("button", { name: "Reopen month" }));
    expect(reopened).toBe(false);
    await user.click(within(screen.getByRole("group", { name: "Reopen this month?" })).getByRole("button", { name: "Yes, reopen the month" }));
    await waitFor(() => expect(reopened).toBe(true));
  });

  it("renders the contract fixture and hides the reopen button when blocked", async () => {
    await openPreview(ReopenPreviewFx as ReopenPreview);
    expect(await screen.findByTestId("block-recoverable_repaid")).toHaveTextContent("Use an adjustment in the current month instead.");
    expect(screen.queryByRole("button", { name: "Reopen month" })).toBeNull();
    expect(screen.getByText("This month cannot be reopened right now.")).toBeInTheDocument();
  });

  it.each([
    ["not_latest_closed", { later_month_ids: [11] }, "A later month is already closed", "November 2026"],
    ["payout_after_close", {}, "A final payout was made after closing", "adjustment in the current month"],
    ["archive_after_close", { member_ids: [4] }, "A member was archived after closing", "Jamal"],
    ["recoverable_repaid", { recoverable_ids: [1] }, "An unpaid share was already repaid", "adjustment in the current month"],
  ] as const)("explains the %s block", async (code, data, title, extra) => {
    await openPreview(preview({ can_reopen: false, blocks: [{ code, data }] }));
    const block = await screen.findByTestId(`block-${code}`);
    expect(block).toHaveTextContent(title);
    expect(block).toHaveTextContent(extra);
    expect(screen.queryByRole("button", { name: "Reopen month" })).toBeNull();
  });

  it("only offers reopening for the latest closed month", async () => {
    mockApi({ months: [nov, oct, sep] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /September 2026/ }));
    expect(await screen.findByText(/Only the latest closed month can be reopened/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review what reopening does" })).toBeNull();
  });

  it("translates a 409 when reopening", async () => {
    server.use(http.post(`${BASE}/months/10/reopen`, () => HttpResponse.json({ message: "x", code: "payout_after_close" }, { status: 409 })));
    const user = await openPreview(preview());
    await user.click(await screen.findByRole("button", { name: "Reopen month" }));
    await user.click(screen.getByRole("button", { name: "Yes, reopen the month" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A final payout was made after this month closed");
  });
});

describe("MonthsPage: doesn't pay", () => {
  async function setup(extra: Mocks = {}) {
    mockApi(extra);
    const bodies: unknown[] = [];
    server.use(
      http.post(`${BASE}/months/11/doesnt-pay`, async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: fxRecoverable }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const form = await screen.findByRole("form", { name: "Add a request" });
    await waitFor(() => expect(within(form).getByRole("option", { name: "Salam" })).toBeInTheDocument());
    await user.selectOptions(within(form).getByLabelText("Member who doesn’t pay"), "3");
    return { user, form, bodies };
  }

  it("sends the equal mode with integer ids only", async () => {
    const { user, form, bodies } = await setup();
    expect(within(form).getByTestId("dp-debt")).toHaveTextContent("300");
    await user.click(within(form).getByRole("button", { name: "Save request" }));
    await waitFor(() => expect(bodies).toEqual([{ member_id: 3, mode: "equal" }]));
  });

  it("sends the by-meals mode", async () => {
    const { user, form, bodies } = await setup();
    await user.click(within(form).getByRole("radio", { name: /By meals/ }));
    await user.click(within(form).getByRole("button", { name: "Save request" }));
    await waitFor(() => expect(bodies).toEqual([{ member_id: 3, mode: "by_meals" }]));
  });

  it("typed mode: remaining counter must reach exactly the debt, then sends paisa", async () => {
    const { user, form, bodies } = await setup();
    await user.click(within(form).getByRole("radio", { name: /Typed amounts/ }));
    const submit = within(form).getByRole("button", { name: "Save request" });
    const counter = within(form).getByTestId("dp-remaining");

    expect(counter).toHaveTextContent("Still to share");
    expect(counter).toHaveTextContent("300");
    expect(submit).toBeDisabled();
    // The debtor gets no input.
    expect(within(form).queryByLabelText("Salam (taka)")).toBeNull();

    await user.type(within(form).getByLabelText("Rahim (taka)"), "100.50");
    expect(counter).toHaveTextContent("Still to share");
    expect(counter).toHaveTextContent("199.50");
    expect(submit).toBeDisabled();

    await user.type(within(form).getByLabelText("Karim (taka)"), "250");
    expect(counter).toHaveTextContent("Too much by");
    expect(counter).toHaveTextContent("50.50");
    expect(submit).toBeDisabled();

    await user.clear(within(form).getByLabelText("Karim (taka)"));
    await user.type(within(form).getByLabelText("Karim (taka)"), "199.50");
    expect(counter).toHaveTextContent("Fully shared");
    expect(submit).toBeEnabled();

    await user.click(submit);
    await waitFor(() =>
      expect(bodies).toEqual([
        { member_id: 3, mode: "manual", manual: [{ member_id: 1, amount_paisa: 10050 }, { member_id: 2, amount_paisa: 19950 }] },
      ]),
    );
  });

  it("flags an invalid typed amount", async () => {
    const { user, form } = await setup();
    await user.click(within(form).getByRole("radio", { name: /Typed amounts/ }));
    await user.type(within(form).getByLabelText("Rahim (taka)"), "1.234");
    expect(within(form).getByRole("alert")).toHaveTextContent("Enter taka like");
    expect(within(form).getByRole("button", { name: "Save request" })).toBeDisabled();
  });

  it("lists pending requests and undoes one", async () => {
    mockApi({ pending: [{ ...fxRecoverable, id: 9, debtor_member_id: 3 }] });
    let undone = false;
    server.use(http.delete(`${BASE}/months/11/doesnt-pay/9`, () => { undone = true; return new HttpResponse(null, { status: 204 }); }));
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText("Salam doesn’t pay")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo the request for Salam" }));
    await waitFor(() => expect(undone).toBe(true));
  });

  it("translates a 409 from the server", async () => {
    const { user, form } = await setup();
    server.use(http.post(`${BASE}/months/11/doesnt-pay`, () => HttpResponse.json({ message: "x", code: "already_doesnt_pay" }, { status: 409 })));
    await user.click(within(form).getByRole("button", { name: "Save request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already has an unpaid-share request");
  });
});

describe("MonthsPage: recoverables", () => {
  const open: Recoverable = {
    ...fxRecoverable, id: 5, status: "open", amount_paisa: 210066, repaid_paisa: 10000,
    shares: [
      { member_id: 1, amount_paisa: 105033, manual_amount_paisa: null },
      { member_id: 4, amount_paisa: 105033, manual_amount_paisa: null },
    ],
  };

  it("shows debtor, amounts, status and flags ex-member shares", async () => {
    mockApi({ recoverables: [open] });
    renderPage();
    const item = await screen.findByTestId("recoverable-5");
    expect(item).toHaveTextContent("Salam");
    expect(item).toHaveTextContent("2,100.66");
    expect(item).toHaveTextContent("100");
    expect(item).toHaveTextContent("Waiting for repayment");
    expect(within(item).getAllByText("Payable to ex-member")).toHaveLength(1);
  });

  it("records a repayment as integer paisa with the date", async () => {
    mockApi({ recoverables: [open] });
    let body: unknown = null;
    server.use(http.post(`${BASE}/recoverables/5/repayments`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: open }, { status: 201 }); }));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Record a repayment from Salam" }));
    const form = screen.getByRole("form", { name: "Repayment from Salam" });
    await user.type(within(form).getByLabelText("Amount (taka)"), "1,000.50");
    fireEvent.change(within(form).getByLabelText("Date received"), { target: { value: "2026-11-15" } });
    await user.click(within(form).getByRole("button", { name: "Save repayment" }));
    await waitFor(() => expect(body).toEqual({ amount_paisa: 100050, paid_on: "2026-11-15" }));
    expect(await screen.findByText("Repayment recorded.")).toBeInTheDocument();
  });

  it("explains exceeds_outstanding", async () => {
    mockApi({ recoverables: [open] });
    server.use(http.post(`${BASE}/recoverables/5/repayments`, () => HttpResponse.json({ message: "x", code: "exceeds_outstanding" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Record a repayment from Salam" }));
    const form = screen.getByRole("form", { name: "Repayment from Salam" });
    await user.type(within(form).getByLabelText("Amount (taka)"), "999999");
    await user.click(within(form).getByRole("button", { name: "Save repayment" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("more than is still owed");
  });

  it("is read-only for a non-manager", async () => {
    mockApi({ manager: false, recoverables: [open] });
    renderPage();
    expect(await screen.findByTestId("recoverable-5")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record a repayment/ })).toBeNull();
  });
});

describe("MonthsPage: adjustments", () => {
  it("lists adjustments for everyone as charge or credit", async () => {
    mockApi({ manager: false, adjustments: [fxAdjustment, { ...fxAdjustment, id: 2, amount_paisa: 2000, note: "Refund" }] });
    renderPage();
    const list = await screen.findByRole("list", { name: "Adjustments" });
    expect(within(list).getByText("Broken glass")).toBeInTheDocument();
    expect(list).toHaveTextContent("Charge");
    expect(list).toHaveTextContent("Credit");
    expect(screen.queryByRole("form", { name: "Add an adjustment" })).toBeNull();
  });

  async function fill(direction: "Charge" | "Credit") {
    mockApi();
    const bodies: unknown[] = [];
    server.use(http.post(`${BASE}/adjustments`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ data: fxAdjustment }, { status: 201 }); }));
    const user = userEvent.setup();
    renderPage();
    const form = await screen.findByRole("form", { name: "Add an adjustment" });
    await waitFor(() => expect(within(form).getByRole("option", { name: "Karim" })).toBeInTheDocument());
    await user.selectOptions(within(form).getByLabelText("Member"), "2");
    await user.selectOptions(within(form).getByLabelText("Applies to"), "meals");
    await user.click(within(form).getByRole("radio", { name: new RegExp(direction) }));
    await user.type(within(form).getByLabelText("Amount (taka)"), "50.50");
    await user.type(within(form).getByLabelText("Reason"), "  Broken glass ");
    await user.click(within(form).getByRole("button", { name: "Save adjustment" }));
    return bodies;
  }

  it("sends a charge as a negative amount", async () => {
    const bodies = await fill("Charge");
    await waitFor(() => expect(bodies).toEqual([{ member_id: 2, group: "meals", amount_paisa: -5050, note: "Broken glass" }]));
  });

  it("sends a credit as a positive amount", async () => {
    const bodies = await fill("Credit");
    await waitFor(() => expect(bodies).toEqual([{ member_id: 2, group: "meals", amount_paisa: 5050, note: "Broken glass" }]));
  });

  it("validates before sending and translates a 409", async () => {
    mockApi();
    server.use(http.post(`${BASE}/adjustments`, () => HttpResponse.json({ message: "x", code: "month_closed" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    const form = await screen.findByRole("form", { name: "Add an adjustment" });
    await user.click(within(form).getByRole("button", { name: "Save adjustment" }));
    expect(await within(form).findByText("Choose a member.")).toBeInTheDocument();
    expect(within(form).getByText("Enter the amount.")).toBeInTheDocument();
    expect(within(form).getByText("Write a short reason.")).toBeInTheDocument();

    await waitFor(() => expect(within(form).getByRole("option", { name: "Karim" })).toBeInTheDocument());
    await user.selectOptions(within(form).getByLabelText("Member"), "2");
    await user.type(within(form).getByLabelText("Amount (taka)"), "10");
    await user.type(within(form).getByLabelText("Reason"), "x");
    await user.click(within(form).getByRole("button", { name: "Save adjustment" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("already closed");
  });
});

describe("MonthsPage: non-manager and locale", () => {
  it("hides every manager action", async () => {
    mockApi({ manager: false });
    renderPage();
    expect(await screen.findByRole("heading", { name: "November 2026", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check if the month can be closed" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Add a request" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Add an adjustment" })).toBeNull();
    // Exports stay available to everyone.
    expect(screen.getByRole("button", { name: "Export month (Excel)" })).toBeInTheDocument();
  });

  it("does not show the reopen flow to a non-manager", async () => {
    mockApi({ manager: false });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: /October 2026/ }));
    expect(screen.queryByRole("button", { name: "Review what reopening does" })).toBeNull();
  });

  it("renders in Bangla", async () => {
    mockApi();
    renderPage({ locale: "bn" });
    expect(await screen.findByRole("heading", { level: 1, name: "মাস" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "মাস বন্ধ করা যাবে কি না দেখুন" })).toBeInTheDocument();
    expect(screen.getByText("একজন সদস্য দিচ্ছেন না")).toBeInTheDocument();
    expect(screen.getByText("সমন্বয়")).toBeInTheDocument();
    expectBanglaOnly(["Salam", "Jamal"]);
  });
});
