import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { Category, Expense, Member, Mess, Month } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";
import { ExpensesPage } from "./expenses-page";

const BASE = `${API_BASE_URL}/api/messes/7`;

const baseMess = { id: 7, name: "Green House", rounding_mode: "two_decimals", manager_member_id: 1, approval_required: true } as Mess;
const member = (id: number, name: string, extra: Partial<Member> = {}): Member => ({
  id, display_name: name, user_id: id, has_account: true, is_admin: false, is_manager: id === 1,
  joined_on: "2026-01-01", left_on: null, archived_at: null, ...extra,
});
const members = [member(1, "Rahim"), member(2, "Karim"), member(3, "Old Timer", { archived_at: "2026-05-01T00:00:00Z" })];
const nov: Month = { id: 11, starts_on: "2026-11-01", ends_on: "2026-11-30", status: "open", fixed_deadline: null, deposit_deadline: null, deposit_paisa: 0, zero_meal_resolution: null, closed_at: null };
const oct: Month = { ...nov, id: 10, starts_on: "2026-10-01", ends_on: "2026-10-31", status: "closed" };
const cat = (id: number, group: Category["group"], name: string, extra: Partial<Category> = {}): Category => ({
  id, group, name, split_type: group === "fixed" ? "equal" : "by_meal", sort: id, is_default: false, archived_at: null, ...extra,
});
const categories = [cat(1, "fixed", "Rent"), cat(2, "fixed", "Gas"), cat(3, "meals", "Fish"), cat(4, "meals", "Old Veg", { archived_at: "2026-01-01T00:00:00Z" })];
const exp = (id: number, category_id: number, amount_paisa: number, extra: Partial<Expense> = {}): Expense => ({
  id, month_id: 11, category_id, amount_paisa, spent_on: "2026-11-02", note: null, paid_by: "member", paid_by_member_id: 2,
  status: "approved", is_late: false, short_cash_converted: false, is_self_recorded: false, created_by_member_id: 2,
  approved_by_member_id: 1, created_at: "2026-11-02T10:00:00Z", ...extra,
});

const approved = exp(1, 1, 150000, { note: "November rent" });
const pendingOne = exp(2, 3, 25000, { status: "pending", approved_by_member_id: null, note: "Rohu fish" });

function mockApi({
  manager = true,
  approvalRequired = true,
  list = [approved, pendingOne],
  pending = [pendingOne],
}: { manager?: boolean; approvalRequired?: boolean; list?: Expense[]; pending?: Expense[] } = {}) {
  const requests: string[] = [];
  const mess = { ...baseMess, approval_required: approvalRequired };
  server.use(
    http.get(BASE, () => HttpResponse.json({ data: { mess, me: manager ? members[0] : members[1] } })),
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
    http.get(`${BASE}/months`, () => HttpResponse.json({ data: [nov, oct] })),
    http.get(`${BASE}/months/current`, () => HttpResponse.json({ data: nov })),
    http.get(`${BASE}/categories`, () => HttpResponse.json({ data: categories })),
    http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${BASE}/expenses`, ({ request }) => {
      const url = new URL(request.url);
      if (url.searchParams.get("status") === "pending" && !url.searchParams.has("month_id")) return HttpResponse.json({ data: pending });
      requests.push(url.search);
      return HttpResponse.json({ data: list });
    }),
  );
  return requests;
}

const renderPage = () => renderWithProviders(<ExpensesPage />, { messId: 7 });
const form = () => screen.findByRole("form", { name: "Add an expense" });
const queue = () => screen.findByRole("region", { name: /Waiting for approval/ });

async function fillBasics(user: ReturnType<typeof userEvent.setup>, amount = "250.5", category = "Fish") {
  await form();
  await user.type(screen.getByLabelText("Amount (taka)"), amount);
  await user.selectOptions(screen.getByLabelText("Category"), category);
}

describe("ExpensesPage entry form", () => {
  it("records an own-pocket expense (manager default) and sends integer paisa", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/expenses`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { expense: exp(9, 3, 25050, { paid_by_member_id: 1, created_by_member_id: 1 }), warnings: [] } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillBasics(user);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-03" } });
    await user.type(screen.getByLabelText("Note (optional)"), "market");
    await user.click(screen.getByRole("button", { name: "Save expense" }));

    await waitFor(() =>
      expect(body).toEqual({ category_id: 3, amount_paisa: 25050, spent_on: "2026-11-03", note: "market", paid_by: "member", paid_by_member_id: 1 }),
    );
    expect(await screen.findByText(/Saved: Fish/)).toBeInTheDocument();
    // Ready for the next receipt.
    await waitFor(() => expect(screen.getByLabelText("Amount (taka)")).toHaveValue(""));
    expect(screen.getByLabelText("Category")).toHaveValue("3");
  });

  it("groups categories into Fixed / Meals and hides archived ones", async () => {
    mockApi();
    renderPage();
    const select = await screen.findByLabelText("Category");
    const groups = within(select).getAllByRole("group");
    expect(groups.map((g) => g.getAttribute("label"))).toEqual(["Fixed bills", "Meals"]);
    expect(within(groups[0]).getAllByRole("option").map((o) => o.textContent)).toEqual(["Rent", "Gas"]);
    expect(within(select).queryByRole("option", { name: "Old Veg" })).toBeNull();
  });

  it("manager can pay from mess cash: no member id sent, short-cash warning and late badge shown", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/expenses`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(
          { data: { expense: exp(9, 3, 50000, { paid_by_member_id: 1, short_cash_converted: true, is_late: true }), warnings: ["short_cash_converted"] } },
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillBasics(user, "500");
    await user.click(screen.getByLabelText("Mess cash"));
    await user.click(screen.getByRole("button", { name: "Save expense" }));

    await waitFor(() => expect(body).toMatchObject({ category_id: 3, amount_paisa: 50000, paid_by: "cash" }));
    expect(body).not.toHaveProperty("paid_by_member_id");
    const status = await screen.findByRole("status", { name: "Expense saved" });
    expect(within(status).getByRole("alert")).toHaveTextContent("Not enough cash in the mess; recorded as the manager's own money.");
    expect(within(status).getByText("Late entry")).toBeInTheDocument();
  });

  it("manager can record another member's pocket", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/expenses`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { expense: exp(9, 3, 10000), warnings: [] } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillBasics(user, "100");
    await user.click(screen.getByLabelText("Another member's pocket"));
    // Must choose who.
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(await screen.findByText("Choose who paid.")).toBeInTheDocument();
    expect(body).toBeNull();
    expect(within(screen.getByLabelText("Member who paid")).queryByRole("option", { name: "Old Timer" })).toBeNull();
    await user.selectOptions(screen.getByLabelText("Member who paid"), "Karim");
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    await waitFor(() => expect(body).toMatchObject({ paid_by: "member", paid_by_member_id: 2 }));
  });

  it("a plain member only has the own-pocket option", async () => {
    mockApi({ manager: false });
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/expenses`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { expense: exp(9, 3, 10000, { status: "pending" }), warnings: [] } }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await fillBasics(user, "100");
    expect(screen.queryByLabelText("Mess cash")).toBeNull();
    expect(screen.queryByLabelText("Another member's pocket")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("You, from your own pocket")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    await waitFor(() => expect(body).toMatchObject({ paid_by: "member", paid_by_member_id: 2, amount_paisa: 10000 }));
    expect(await screen.findByText("The manager needs to approve this before it counts.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Waiting for approval/ })).toBeNull();
  });

  it("rejects a bad amount client-side", async () => {
    mockApi();
    const user = userEvent.setup();
    renderPage();
    await fillBasics(user, "1.234");
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(await screen.findByText(/Enter taka like 1,000/)).toBeInTheDocument();
  });

  it("shows 422 field errors from the server", async () => {
    mockApi();
    server.use(
      http.post(`${BASE}/expenses`, () => HttpResponse.json({ message: "invalid", errors: { spent_on: ["No month covers that date."] } }, { status: 422 })),
    );
    const user = userEvent.setup();
    renderPage();
    await fillBasics(user, "100");
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(await screen.findByText("No month covers that date.")).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveAttribute("aria-invalid", "true");
  });

  it("shows a clear message on 409 month_closed", async () => {
    mockApi();
    server.use(http.post(`${BASE}/expenses`, () => HttpResponse.json({ message: "closed", code: "month_closed" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await fillBasics(user, "100");
    await user.click(screen.getByRole("button", { name: "Save expense" }));
    expect(await screen.findByText(/That month is closed/)).toBeInTheDocument();
  });
});

describe("ExpensesPage list", () => {
  it("lists the month's expenses with badges and approved-only totals", async () => {
    const requests = mockApi({ list: [approved, pendingOne, exp(3, 2, 5000, { is_late: true, is_self_recorded: true, short_cash_converted: true, paid_by_member_id: 1, created_by_member_id: 1 })] });
    renderPage();
    expect(await screen.findByText("November rent")).toBeInTheDocument();
    const list = within(screen.getByRole("region", { name: /^Expenses —/ }));
    const row = list.getByTestId("expense-3");
    expect(within(row).getByText("Late entry")).toBeInTheDocument();
    expect(within(row).getByText("Recorded by manager")).toBeInTheDocument();
    expect(within(row).getByText("Short cash")).toBeInTheDocument();
    expect(within(list.getByTestId("expense-2")).getByText("Pending approval")).toBeInTheDocument();
    expect(within(list.getByTestId("expense-1")).getByText("Approved")).toBeInTheDocument();
    // 1500 + 50 fixed; pending fish not counted.
    expect(within(screen.getByTestId("total-fixed")).getByText("৳1,550.00")).toBeInTheDocument();
    expect(within(screen.getByTestId("total-meals")).getByText("৳0.00")).toBeInTheDocument();
    expect(requests[0]).toContain("month_id=11");
  });

  it("filters by status, member, category and switches month", async () => {
    const requests = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("November rent");
    await user.selectOptions(screen.getByLabelText("Status"), "Approved");
    await waitFor(() => expect(requests.at(-1)).toContain("status=approved"));
    await user.selectOptions(screen.getByLabelText("Recorded or paid by"), "Karim");
    await waitFor(() => expect(requests.at(-1)).toContain("member_id=2"));
    await user.selectOptions(screen.getByLabelText("Filter by category"), "Gas");
    await waitFor(() => expect(requests.at(-1)).toContain("category_id=2"));
    await user.selectOptions(screen.getByLabelText("Month"), "10");
    await waitFor(() => expect(requests.at(-1)).toContain("month_id=10"));
  });

  it("hides edit/delete a member can't use, and shows the server's 409 anyway", async () => {
    // Member 2, approval on: pending own expense is editable, approved own expense is not.
    mockApi({ manager: false });
    server.use(http.delete(`${BASE}/expenses/2`, () => HttpResponse.json({ message: "x", code: "already_approved" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("November rent");
    expect(screen.queryByRole("button", { name: /^Edit: Rent/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Delete: Rent/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Delete: Fish/ }));
    await user.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText(/already approved/)).toBeInTheDocument();
  });

  it("shows the owner their own approved expense when approval is off", async () => {
    mockApi({ manager: false, approvalRequired: false });
    renderPage();
    await screen.findByText("November rent");
    expect(screen.getByRole("button", { name: /^Edit: Rent/ })).toBeInTheDocument();
  });

  it("offers nothing on closed months and no edit for rejected expenses", async () => {
    mockApi({ list: [exp(5, 1, 1000, { month_id: 10 }), exp(6, 1, 2000, { status: "rejected", created_by_member_id: 1, paid_by_member_id: 1 })] });
    server.use(http.get(`${BASE}/months/current`, () => HttpResponse.json({ data: nov })));
    renderPage();
    await screen.findByTestId("expense-5");
    expect(within(screen.getByTestId("expense-5")).queryByRole("button")).toBeNull();
    expect(within(screen.getByTestId("expense-6")).queryByRole("button", { name: /^Edit/ })).toBeNull();
    expect(within(screen.getByTestId("expense-6")).getByRole("button", { name: /^Delete/ })).toBeInTheDocument();
  });

  it("edits only the changed fields", async () => {
    mockApi({ list: [approved] });
    let body: unknown = null;
    server.use(
      http.patch(`${BASE}/expenses/1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...approved, amount_paisa: 200000 } });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("November rent");
    await user.click(screen.getByRole("button", { name: /^Edit: Rent/ }));
    const amount = screen.getByLabelText("Amount (taka)");
    expect(amount).toHaveValue("1500");
    await user.clear(amount);
    await user.type(amount, "2,000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(body).toEqual({ amount_paisa: 200000 }));
  });
});

describe("ExpensesPage approval queue", () => {
  it("approves a pending expense", async () => {
    mockApi();
    let approvedId: string | null = null;
    server.use(
      http.post(`${BASE}/expenses/:id/approve`, ({ params }) => {
        approvedId = String(params.id);
        return HttpResponse.json({ data: { ...pendingOne, status: "approved", short_cash_converted: true } });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const region = await queue();
    expect(await within(region).findByText("Rohu fish")).toBeInTheDocument();
    expect(within(region).getByText("Recorded by Karim")).toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: /^Approve/ }));
    await waitFor(() => expect(approvedId).toBe("2"));
    expect(await screen.findByText("Not enough cash in the mess; recorded as the manager's own money.")).toBeInTheDocument();
  });

  it("requires a reason to reject, then sends it", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.post(`${BASE}/expenses/2/reject`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { ...pendingOne, status: "rejected" } });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    const region = await queue();
    await user.click(await within(region).findByRole("button", { name: /^Reject/ }));
    await user.click(within(region).getByRole("button", { name: "Reject expense" }));
    expect(await within(region).findByText("Write a reason for rejecting.")).toBeInTheDocument();
    expect(body).toBeNull();
    await user.type(within(region).getByLabelText("Reason for rejecting"), "No receipt");
    await user.click(within(region).getByRole("button", { name: "Reject expense" }));
    await waitFor(() => expect(body).toEqual({ reason: "No receipt" }));
  });

  it("shows the server's not_pending conflict", async () => {
    mockApi();
    server.use(http.post(`${BASE}/expenses/2/approve`, () => HttpResponse.json({ message: "x", code: "not_pending" }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    const region = await queue();
    await user.click(await within(region).findByRole("button", { name: /^Approve/ }));
    expect(await within(region).findByText(/no longer waiting for approval/)).toBeInTheDocument();
  });

  it("is hidden when approval is off and nothing is pending, but shown if something is", async () => {
    mockApi({ approvalRequired: false, pending: [] });
    renderPage();
    await screen.findByText("November rent");
    expect(screen.queryByRole("region", { name: /Waiting for approval/ })).toBeNull();
  });

  it("still shows pending items after approval was switched off", async () => {
    mockApi({ approvalRequired: false });
    renderPage();
    expect(await queue()).toBeInTheDocument();
  });

  it("is never shown to a member", async () => {
    mockApi({ manager: false });
    renderPage();
    await screen.findByText("November rent");
    expect(screen.queryByRole("region", { name: /Waiting for approval/ })).toBeNull();
  });
});

describe("ExpensesPage Bangla", () => {
  it("renders Bangla", async () => {
    mockApi();
    renderWithProviders(<ExpensesPage />, { messId: 7, locale: "bn" });
    expect(await screen.findByText("খরচ যোগ করুন")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByTestId("total-fixed")).getByText("৳১,৫০০.০০")).toBeInTheDocument());
  });
});
