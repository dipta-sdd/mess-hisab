import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/features/types";
import type { Category, Expense, Member, Mess, Month } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { renderWithProviders } from "@/test/render";

let path = "/7";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => path }));

const BASE = `${API_BASE_URL}/api/messes/7`;
const items: NavItem[] = [{ key: "dash", href: (id) => `/${id}`, labelKey: "common.language.label", icon: "dashboard", order: 10 }];
const mess = { id: 7, name: "Green House", rounding_mode: "two_decimals", manager_member_id: 1, approval_required: false } as Mess;
const me: Member = { id: 2, display_name: "Karim", user_id: 2, has_account: true, is_admin: false, is_manager: false, joined_on: "2026-01-01", left_on: null, archived_at: null };
const month: Month = { id: 11, starts_on: "2026-11-01", ends_on: "2026-11-30", status: "open", fixed_deadline: null, deposit_deadline: null, deposit_paisa: 0, zero_meal_resolution: null, closed_at: null };
const fish: Category = { id: 3, group: "meals", name: "Fish", split_type: "by_meal", sort: 1, is_default: false, archived_at: null };
const saved = (extra: Partial<Expense> = {}): Expense => ({
  id: 9, month_id: 11, category_id: 3, amount_paisa: 25000, spent_on: "2026-11-02", note: null, paid_by: "member", paid_by_member_id: 2,
  status: "approved", is_late: false, short_cash_converted: false, is_self_recorded: false, created_by_member_id: 2,
  approved_by_member_id: null, created_at: "2026-11-02T10:00:00Z", ...extra,
});

function mockApi(opts: { archived?: boolean; warnings?: string[]; expense?: Expense } = {}) {
  server.use(
    http.get(`${API_BASE_URL}/api/auth/me`, () =>
      HttpResponse.json({
        user: { id: 2, name: "K", email: "k@x.com", phone: "01700000002", phone_verified: true, has_verified_contact: true, locale: "en", has_password: true, has_google: false },
        memberships: [{ mess_id: 7, mess_name: "Green House", member_id: 2, archived: Boolean(opts.archived), is_admin: false, is_manager: false }],
      }),
    ),
    http.get(BASE, () => HttpResponse.json({ data: { mess, me } })),
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: [me] })),
    http.get(`${BASE}/categories`, () => HttpResponse.json({ data: [fish] })),
    http.get(`${BASE}/months/current`, () => HttpResponse.json({ data: month })),
    http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
    http.post(`${BASE}/expenses`, () => HttpResponse.json({ data: { expense: opts.expense ?? saved(), warnings: opts.warnings ?? [] } }, { status: 201 })),
  );
}

const renderShell = (locale: "en" | "bn" = "en") => renderWithProviders(<AppShell items={items}>page</AppShell>, { messId: 7, locale });
const fab = () => screen.findAllByRole("button", { name: "Add expense" }).then((all) => all.find((b) => b.className.includes("fixed")));

async function fillAndSave(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Amount (taka)"), "250");
  await user.selectOptions(screen.getByLabelText("Category"), "Fish");
  await user.click(screen.getByRole("button", { name: "Save expense" }));
}

beforeEach(() => {
  path = "/7";
});
afterEach(() => vi.restoreAllMocks());

describe("quick-add expense", () => {
  it("FAB opens the form in a dialog, saves, invalidates money caches and closes", async () => {
    mockApi();
    const spy = vi.spyOn(QueryClient.prototype, "invalidateQueries");
    const user = userEvent.setup();
    renderShell();
    const trigger = await fab();
    expect(trigger).toBeDefined();
    await user.click(trigger!);
    expect(await screen.findByRole("dialog", { name: "Add expense" })).toBeInTheDocument();
    await fillAndSave(user);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Expense saved")).toBeInTheDocument();
    const prefixes = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey[0]);
    expect(prefixes).toEqual(expect.arrayContaining(["balance", "expenses", "months"]));
  });

  it("shows the short-cash note after saving and Done closes", async () => {
    mockApi({ warnings: ["short_cash_converted"], expense: saved({ short_cash_converted: true }) });
    const user = userEvent.setup();
    renderShell();
    await user.click((await fab())!);
    await fillAndSave(user);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("Escape closes and focus returns to the trigger", async () => {
    mockApi();
    const user = userEvent.setup();
    renderShell();
    const trigger = (await fab())!;
    await user.click(trigger);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("sidebar button opens the same dialog", async () => {
    mockApi();
    const user = userEvent.setup();
    renderShell();
    const side = await screen.findByRole("button", { name: "Expense" });
    await user.click(side);
    expect(await screen.findByRole("dialog", { name: "Add expense" })).toBeInTheDocument();
  });

  it("has no FAB on the Meals page, and nothing on the Expenses page", async () => {
    mockApi();
    path = "/7/meals";
    const { unmount } = renderShell();
    await screen.findAllByText("Green House");
    expect(screen.queryAllByRole("button", { name: "Add expense" }).filter((b) => b.className.includes("fixed"))).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Expense" })).toBeInTheDocument();
    unmount();
    path = "/7/expenses";
    renderShell();
    await screen.findAllByText("Green House");
    expect(screen.queryByRole("button", { name: "Add expense" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expense" })).toBeNull();
  });

  it("is hidden for archived memberships", async () => {
    mockApi({ archived: true });
    renderShell();
    await screen.findAllByText("Green House");
    expect(screen.queryByRole("button", { name: "Add expense" })).toBeNull();
  });

  it("works in Bangla", async () => {
    mockApi();
    renderShell("bn");
    expect((await screen.findAllByRole("button", { name: "খরচ যোগ করুন" })).length).toBeGreaterThan(0);
  });
});
