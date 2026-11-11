import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useSyncExternalStore } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLog, Member } from "@/lib/api/contract";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import fixture from "../../../../docs/contract-fixtures/AuditLog.json";

// A tiny in-memory URL so useSearchParams/router.replace behave like the real thing.
const nav = vi.hoisted(() => {
  let search = "";
  const listeners = new Set<() => void>();
  return {
    get: () => search,
    set: (value: string) => {
      search = value;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

vi.mock("@/lib/nav", async (orig) => ({
  ...(await orig<object>()),
  useRouter: () => ({
    replace: (url: string) => nav.set(url.includes("?") ? url.slice(url.indexOf("?") + 1) : ""),
    push: vi.fn(),
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/3/audit",
  useSearchParams: () => new URLSearchParams(useSyncExternalStore(nav.subscribe, nav.get, nav.get)),
}));

import { AuditPage } from "./audit-page";

const BASE = `${API_BASE_URL}/api/messes/3`;
const member = (id: number, name: string): Member => ({
  id, display_name: name, user_id: id, has_account: true, is_admin: false, is_manager: false,
  joined_on: "2026-01-01", left_on: null, archived_at: null,
});
const members = [member(1, "Rina"), member(2, "Karim")];

const entry = (over: Partial<AuditLog> & { id: number; event: string }): AuditLog => ({
  ...(fixture as AuditLog), before: {}, after: {}, ...over,
});
const envelope = (data: AuditLog[], page = 1, last = 1) => ({
  data,
  links: { first: null, last: null, prev: null, next: null },
  meta: { current_page: page, last_page: last, per_page: 25, total: data.length * last, from: 1, to: data.length },
});

function mockApi(respond: (search: URLSearchParams) => ReturnType<typeof envelope>) {
  const requests: URLSearchParams[] = [];
  server.use(
    http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
    http.get(`${BASE}/audit`, ({ request }) => {
      const search = new URL(request.url).searchParams;
      requests.push(search);
      return HttpResponse.json(respond(search));
    }),
  );
  return requests;
}

const render = (locale: "en" | "bn" = "en") => renderWithProviders(<AuditPage />, { messId: 3, locale });

beforeEach(() => nav.set(""));

describe("AuditPage", () => {
  it("renders summaries, the actor and an expandable before -> after diff with money formatted", async () => {
    mockApi(() =>
      envelope([
        entry({ id: 3, event: "payment.updated", member_id: 2, before: { amount_paisa: 150000, note: null }, after: { amount_paisa: 175050, note: "bKash" } }),
        entry({ id: 2, event: "month.closed", member_id: 1 }),
        entry({ id: 1, event: "custom_thing.happened", member_id: null }),
        entry({ id: 4, event: "expense.created", member_id: 1, after: { amount_paisa: 150000 } }),
      ]),
    );
    const user = userEvent.setup();
    render();
    expect(await screen.findByText("Payment changed")).toBeInTheDocument();
    expect(screen.getByText("Month closed")).toBeInTheDocument();
    expect(screen.getByText("Expense added")).toBeInTheDocument();
    expect(screen.getByText("custom_thing.happened")).toBeInTheDocument(); // unknown event falls back to the raw name
    expect(within(screen.getByRole("list", { name: "Audit log" })).getByText("Karim")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();

    const changed = screen.getAllByRole("button", { name: /Show changes \(2\)/ })[0];
    expect(changed).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("৳1,750.50")).toBeNull();
    await user.click(changed);
    expect(changed).toHaveAttribute("aria-expanded", "true");
    const amount = screen.getByTestId("diff-amount_paisa");
    expect(amount).toHaveTextContent("৳1,500.00");
    expect(amount).toHaveTextContent("৳1,750.50");
    expect(screen.getByTestId("diff-note")).toHaveTextContent("(none)");
    expect(screen.getByTestId("diff-note")).toHaveTextContent("bKash");
  });

  it("shows only keys that changed", async () => {
    mockApi(() => envelope([entry({ id: 1, event: "payment.updated", before: { a: 1, b: 2 }, after: { a: 1, b: 3 } })]));
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /Show changes \(1\)/ }));
    expect(screen.getByTestId("diff-b")).toBeInTheDocument();
    expect(screen.queryByTestId("diff-a")).toBeNull();
  });

  it("sends each filter as a query param and keeps it in the URL", async () => {
    const requests = mockApi(() => envelope([entry({ id: 1, event: "expense.created" })]));
    const user = userEvent.setup();
    render();
    await screen.findByText("Expense added");
    expect(requests[0].has("event")).toBe(false);
    await screen.findByRole("option", { name: "Karim" });

    await user.selectOptions(screen.getByLabelText("What happened"), "expense.");
    await waitFor(() => expect(requests.at(-1)!.get("event")).toBe("expense."));
    await user.selectOptions(screen.getByLabelText("Who did it"), "Karim");
    await waitFor(() => expect(requests.at(-1)!.get("member_id")).toBe("2"));
    await user.type(screen.getByLabelText("From date"), "2026-11-01");
    await waitFor(() => expect(requests.at(-1)!.get("from")).toBe("2026-11-01"));
    await user.type(screen.getByLabelText("To date"), "2026-11-30");
    await waitFor(() => expect(requests.at(-1)!.get("to")).toBe("2026-11-30"));

    const url = new URLSearchParams(nav.get());
    expect(Object.fromEntries(url)).toEqual({ event: "expense.", member_id: "2", from: "2026-11-01", to: "2026-11-30" });
  });

  it("reads filters from the URL on load", async () => {
    nav.set("event=payment.&member_id=1&page=2");
    const requests = mockApi(() => envelope([entry({ id: 1, event: "payment.created" })], 2, 3));
    render();
    await screen.findByText("Payment added");
    expect(requests[0].get("event")).toBe("payment.");
    expect(requests[0].get("member_id")).toBe("1");
    expect(requests[0].get("page")).toBe("2");
  });

  it("paginates with newer/older and resets to page 1 when a filter changes", async () => {
    const requests = mockApi((s) => envelope([entry({ id: 1, event: "expense.created" })], Number(s.get("page") ?? 1), 3));
    const user = userEvent.setup();
    render();
    expect(await screen.findByText("Page 1 of 3 (3 entries)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Newer" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Older" }));
    expect(await screen.findByText("Page 2 of 3 (3 entries)")).toBeInTheDocument();
    expect(requests.at(-1)!.get("page")).toBe("2");
    expect(new URLSearchParams(nav.get()).get("page")).toBe("2");

    await user.selectOptions(screen.getByLabelText("What happened"), "payment.");
    await waitFor(() => expect(requests.at(-1)!.get("event")).toBe("payment."));
    expect(requests.at(-1)!.has("page")).toBe(false);
    await act(async () => {});
    const nextBtn = within(screen.getByRole("navigation", { name: "Pages" })).getByRole("button", { name: "Older" });
    expect(nextBtn).toBeEnabled();
  });

  it("disables Older on the last page", async () => {
    nav.set("page=3");
    mockApi(() => envelope([entry({ id: 1, event: "expense.created" })], 3, 3));
    render();
    await screen.findByText("Page 3 of 3 (3 entries)");
    expect(screen.getByRole("button", { name: "Older" })).toBeDisabled();
  });

  it("shows empty and error states", async () => {
    mockApi(() => envelope([]));
    const { unmount } = render();
    expect(await screen.findByText("No activity matches these filters.")).toBeInTheDocument();
    unmount();

    server.use(
      http.get(`${BASE}/members`, () => HttpResponse.json({ data: members })),
      http.get(`${BASE}/audit`, () => HttpResponse.json({ message: "boom" }, { status: 500 })),
    );
    render();
    expect(await screen.findByText("Could not load the audit log. Please try again.")).toBeInTheDocument();
  });

  it("does not call the API for an inverted date range", async () => {
    nav.set("from=2026-11-10&to=2026-11-01");
    const requests = mockApi(() => envelope([]));
    render();
    expect(await screen.findByText("The end date cannot be before the start date.")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("renders in Bangla", async () => {
    mockApi(() => envelope([entry({ id: 1, event: "payout.final", member_id: 1, after: { amount_paisa: 150000 } })]));
    const user = userEvent.setup();
    render("bn");
    expect(await screen.findByText("ফাইনাল হিসাবের টাকা দেওয়া হয়েছে")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "অডিট লগ" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /পরিবর্তন দেখুন/ }));
    expect(screen.getByTestId("diff-amount_paisa")).toHaveTextContent("৳১,৫০০.০০");
    expectBanglaOnly(["payout.final", "amount_paisa", "2026-11-02T10:00:00+06:00"]);
  });
});
