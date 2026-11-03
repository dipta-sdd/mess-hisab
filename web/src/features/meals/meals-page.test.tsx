import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { MealEntry, Member, Mess, Month } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { MealsPage } from "./meals-page";

const BASE = `${API_BASE_URL}/api/messes/7`;

const baseMess = {
  id: 7, name: "Green House", rounding_mode: "two_decimals", manager_member_id: 1,
  meal_tracking: "daily_number", meal_entry_by: "manager",
} as Mess;
const member = (id: number, name: string, extra: Partial<Member> = {}): Member => ({
  id, display_name: name, user_id: id, has_account: true, is_admin: false, is_manager: id === 1,
  joined_on: "2026-01-01", left_on: null, archived_at: null, ...extra,
});
const members = [
  member(1, "Rahim"),
  member(2, "Karim"),
  member(3, "Old Timer", { left_on: "2026-10-15", archived_at: "2026-10-15T00:00:00Z" }),
  member(4, "Nilu", { joined_on: "2026-11-10" }),
];
const nov: Month = { id: 11, starts_on: "2026-11-01", ends_on: "2026-11-30", status: "open", fixed_deadline: null, deposit_deadline: null, deposit_paisa: 0, zero_meal_resolution: null, closed_at: null };
const oct: Month = { ...nov, id: 10, starts_on: "2026-10-01", ends_on: "2026-10-31", status: "closed" };
const entry = (id: number, member_id: number, entry_date: string, extra: Partial<MealEntry> = {}): MealEntry => ({
  id, member_id, entry_date, breakfast: false, lunch: false, dinner: false, meals_centi: 0, guest_meals_centi: 0, ...extra,
});

interface Options {
  tracking?: Mess["meal_tracking"];
  by?: Mess["meal_entry_by"];
  manager?: boolean;
  current?: Month;
  entries?: MealEntry[];
  totals?: Record<string, { meals_centi: number; guest_meals_centi: number }>;
  serverStyle?: Mess["meal_tracking"];
}

function mockApi({ tracking = "daily_number", by = "manager", manager = true, current = nov, entries = [], totals, serverStyle }: Options = {}) {
  const mess = { ...baseMess, meal_tracking: tracking, meal_entry_by: by } as Mess;
  const calls = { gets: [] as string[] };
  server.use(
    http.get(BASE, () => HttpResponse.json({ data: { mess, me: member(manager ? 1 : 2, manager ? "Rahim" : "Karim", { is_manager: manager }) } })),
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
    http.get(`${BASE}/months`, () => HttpResponse.json({ data: [nov, oct] })),
    http.get(`${BASE}/months/current`, () => HttpResponse.json({ data: current })),
    http.get(`${API_BASE_URL}/sanctum/csrf-cookie`, () => new HttpResponse(null, { status: 204 })),
    http.get(`${BASE}/meals`, ({ request }) => {
      calls.gets.push(new URL(request.url).search);
      return HttpResponse.json({
        data: {
          month_id: current.id,
          style: serverStyle ?? tracking,
          entries,
          totals: totals ?? { "1": { meals_centi: 0, guest_meals_centi: 0 }, "2": { meals_centi: 0, guest_meals_centi: 0 } },
        },
      });
    }),
  );
  return calls;
}

const renderPage = () => renderWithProviders(<MealsPage scope="all" />, { messId: 7 });
const cell = (kind: string, who: string, day = "3 Nov 2026") => screen.getByLabelText(`${kind}: ${who}, ${day}`);

describe("MealsPage", () => {
  it("daily_number: saves half meals as centi-meals with guests, via bulk", async () => {
    mockApi();
    let body: unknown = null;
    server.use(
      http.put(`${BASE}/meals/bulk`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: [] });
      }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    expect(screen.queryByLabelText(/Meals: Old Timer/)).toBeNull();

    await user.type(cell("Meals", "Rahim"), "2.5");
    await user.type(cell("Guest meals", "Rahim"), "1");
    await user.type(cell("Meals", "Karim", "4 Nov 2026"), "3");
    await user.click(screen.getByRole("button", { name: "Save meals" }));

    await waitFor(() =>
      expect(body).toEqual({
        entries: [
          { member_id: 1, entry_date: "2026-11-03", meals_centi: 250, guest_meals_centi: 100 },
          { member_id: 2, entry_date: "2026-11-04", meals_centi: 300 },
        ],
      }),
    );
    expect(await screen.findByText("Meals saved.")).toBeInTheDocument();
  });

  it("rejects a non-half step client-side without calling the API", async () => {
    mockApi();
    let called = false;
    server.use(http.put(`${BASE}/meals/bulk`, () => { called = true; return HttpResponse.json({ data: [] }); }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    await user.type(cell("Meals", "Rahim"), "2.3");
    expect(cell("Meals", "Rahim")).toHaveAttribute("aria-invalid", "true");
    await user.click(screen.getByRole("button", { name: "Save meals" }));
    expect(await screen.findByText(/half numbers like 2 or 2\.5/)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it("bld_ticks: sends the three ticks and no meals_centi", async () => {
    mockApi({ tracking: "bld_ticks", entries: [entry(1, 2, "2026-11-03", { lunch: true, meals_centi: 100 })] });
    let body: unknown = null;
    server.use(http.put(`${BASE}/meals/bulk`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: [] }); }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Breakfast: Rahim, 3 Nov 2026");
    expect(cell("Lunch", "Karim")).toBeChecked();

    await user.click(cell("Breakfast", "Rahim"));
    await user.click(cell("Dinner", "Rahim"));
    await user.click(cell("Breakfast", "Karim"));
    await user.click(screen.getByRole("button", { name: "Save meals" }));

    await waitFor(() =>
      expect(body).toEqual({
        entries: [
          { member_id: 1, entry_date: "2026-11-03", breakfast: true, lunch: false, dinner: true },
          { member_id: 2, entry_date: "2026-11-03", breakfast: true, lunch: true, dinner: false },
        ],
      }),
    );
  });

  it("month_total: one number per member, dated on the month's first day", async () => {
    mockApi({
      tracking: "month_total",
      entries: [entry(1, 1, "2026-11-01", { meals_centi: 4550 })],
      totals: { "1": { meals_centi: 4550, guest_meals_centi: 0 }, "2": { meals_centi: 0, guest_meals_centi: 0 } },
    });
    let body: unknown = null;
    server.use(http.put(`${BASE}/meals/bulk`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: [] }); }));
    const user = userEvent.setup();
    renderPage();
    const rahim = await screen.findByLabelText("Meals: Rahim");
    expect(rahim).toHaveValue("45.5");
    expect(screen.queryByText("One day")).toBeNull();

    const karim = screen.getByLabelText("Meals: Karim");
    await user.type(karim, "200");
    await user.click(screen.getByRole("button", { name: "Save meals" }));
    await waitFor(() => expect(body).toEqual({ entries: [{ member_id: 2, entry_date: "2026-11-01", meals_centi: 20000 }] }));
  });

  it("shows totals from the API, not computed in the browser", async () => {
    mockApi({ totals: { "1": { meals_centi: 7250, guest_meals_centi: 300 }, "2": { meals_centi: 100, guest_meals_centi: 0 } } });
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    expect(screen.getByTestId("total-1")).toHaveTextContent("72.5");
    expect(screen.getByTestId("total-1")).toHaveTextContent("+3 guest");
    expect(screen.getByTestId("total-2")).toHaveTextContent("1");
  });

  it("greys out days before a member joined", async () => {
    mockApi();
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    expect(screen.queryByLabelText("Meals: Nilu, 3 Nov 2026")).toBeNull();
  });

  it("self mode: a member edits only their own row and saves with a single PUT", async () => {
    mockApi({ by: "self", manager: false, entries: [entry(1, 1, "2026-11-03", { meals_centi: 200 })] });
    const bodies: unknown[] = [];
    let bulkCalled = false;
    server.use(
      http.put(`${BASE}/meals`, async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ data: entry(5, 2, "2026-11-03", { meals_centi: 150 }) }); }),
      http.put(`${BASE}/meals/bulk`, () => { bulkCalled = true; return HttpResponse.json({ data: [] }); }),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Meals: Karim, 3 Nov 2026");
    expect(screen.queryByLabelText("Meals: Rahim, 3 Nov 2026")).toBeNull();
    expect(screen.getByText("You can see and change your own meals only.")).toBeInTheDocument();

    await user.type(cell("Meals", "Karim"), "1.5");
    await user.click(screen.getByRole("button", { name: "Save meals" }));
    await waitFor(() => expect(bodies).toEqual([{ member_id: 2, entry_date: "2026-11-03", meals_centi: 150 }]));
    expect(bulkCalled).toBe(false);
  });

  it("a plain member sees only their own row", async () => {
    mockApi({ by: "manager", manager: false, entries: [entry(1, 1, "2026-11-03", { meals_centi: 250 })] });
    renderPage();
    await screen.findByTestId("readonly-note");
    expect(screen.queryByLabelText("Rahim, 3 Nov 2026")).toBeNull();
    expect(screen.queryByTestId("total-1")).toBeNull();
    expect(screen.getByTestId("total-2")).toBeInTheDocument();
  });

  it("manager-only mode: a plain member sees their own row read-only", async () => {
    mockApi({ by: "manager", manager: false, entries: [entry(1, 1, "2026-11-03", { meals_centi: 250 })] });
    renderPage();
    expect(await screen.findByTestId("readonly-note")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Save meals" })).toBeNull();
  });

  it("closed month is read-only for the manager too", async () => {
    mockApi({ current: oct });
    renderPage();
    expect(await screen.findByTestId("closed-note")).toBeInTheDocument();
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Save meals" })).toBeNull();
  });

  it("tracking off: explains it and shows no grid", async () => {
    mockApi({ tracking: "off" });
    renderPage();
    const off = await screen.findByTestId("tracking-off");
    expect(within(off).getByText("Meal tracking is off")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save meals" })).toBeNull();
  });

  it.each([
    ["meal_tracking_off", /Meal tracking is turned off/],
    ["month_closed", /That month is closed/],
  ])("shows a friendly message on 409 %s", async (code, text) => {
    mockApi();
    server.use(http.put(`${BASE}/meals/bulk`, () => HttpResponse.json({ message: "server words", code }, { status: 409 })));
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    await user.type(cell("Meals", "Rahim"), "1");
    await user.click(screen.getByRole("button", { name: "Save meals" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.queryByText("server words")).toBeNull();
  });

  it("maps 422 bulk errors back to the member and day", async () => {
    mockApi();
    server.use(
      http.put(`${BASE}/meals/bulk`, () =>
        HttpResponse.json({ message: "invalid", errors: { "entries.1.entry_date": ["This member was not in the mess on that date."] } }, { status: 422 }),
      ),
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    await user.type(cell("Meals", "Rahim"), "1");
    await user.type(cell("Meals", "Karim", "4 Nov 2026"), "1");
    await user.click(screen.getByRole("button", { name: "Save meals" }));
    expect(await screen.findByText("Karim, 4 Nov 2026: This member was not in the mess on that date.")).toBeInTheDocument();
    // The typed values are kept so the person can fix them.
    expect(cell("Meals", "Karim", "4 Nov 2026")).toHaveValue("1");
  });

  it("day view: steps through days with a member list", async () => {
    mockApi();
    let body: unknown = null;
    server.use(http.put(`${BASE}/meals/bulk`, async ({ request }) => { body = await request.json(); return HttpResponse.json({ data: [] }); }));
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    await user.click(screen.getByRole("button", { name: "One day" }));
    expect(screen.queryByRole("table")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Pick a day"), "2026-11-05");
    await user.type(screen.getByLabelText("Meals: Rahim, 5 Nov 2026"), "2");
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await user.type(screen.getByLabelText("Meals: Karim, 6 Nov 2026"), "0.5");
    await user.click(screen.getByRole("button", { name: "Save meals" }));

    await waitFor(() =>
      expect(body).toEqual({
        entries: [
          { member_id: 1, entry_date: "2026-11-05", meals_centi: 200 },
          { member_id: 2, entry_date: "2026-11-06", meals_centi: 50 },
        ],
      }),
    );
  });

  it("switches month and loads that month's meals", async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Meals: Rahim, 3 Nov 2026");
    await user.selectOptions(screen.getByLabelText("Month"), "10");
    await waitFor(() => expect(calls.gets.at(-1)).toContain("month_id=10"));
  });

  it("renders Bangla", async () => {
    mockApi({ totals: { "1": { meals_centi: 250, guest_meals_centi: 0 }, "2": { meals_centi: 0, guest_meals_centi: 0 } } });
    renderWithProviders(<MealsPage scope="all" />, { messId: 7, locale: "bn" });
    expect(await screen.findByRole("heading", { name: "মিল" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("total-1")).toHaveTextContent("২.৫"));
    expect(screen.getByRole("button", { name: "একদিন" })).toBeInTheDocument();
    expectBanglaOnly([]);
  });
});
