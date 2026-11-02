import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { NavItem } from "@/features/types";
import { API_BASE_URL } from "@/lib/api-client/client";
import { server } from "@/test/msw/server";
import { expectBanglaOnly } from "@/test/bangla";
import { renderWithProviders } from "@/test/render";
import { AppShell } from "./app-shell";
import { rolesOf, visibleNavItems } from "./nav-items";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/7/expenses" }));

const items: NavItem[] = [
  { key: "settings", href: (id) => `/${id}/settings`, labelKey: "app.name", icon: "settings", roles: ["admin"], order: 30 },
  { key: "expenses", href: (id) => `/${id}/expenses`, labelKey: "common.shell.messFallback", icon: "expenses", order: 20 },
  { key: "dash", href: (id) => `/${id}`, labelKey: "common.language.label", icon: "dashboard", order: 10 },
  { key: "close", href: (id) => `/${id}/close`, labelKey: "common.balance.settled", icon: "months", roles: ["manager", "admin"], order: 40 },
];

function me(flags: { is_admin: boolean; is_manager: boolean }) {
  server.use(
    http.get(`${API_BASE_URL}/api/auth/me`, () =>
      HttpResponse.json({
        user: { id: 1, name: "A", email: "a@x.com", locale: "en", has_password: true, has_google: false },
        memberships: [{ mess_id: 7, mess_name: "Green House", member_id: 3, archived: false, ...flags }],
      }),
    ),
  );
}

describe("nav-items", () => {
  it("filters by role and sorts by order", () => {
    expect(visibleNavItems(items, rolesOf({ is_admin: false, is_manager: false })).map((i) => i.key)).toEqual(["dash", "expenses"]);
    expect(visibleNavItems(items, rolesOf({ is_admin: false, is_manager: true })).map((i) => i.key)).toEqual(["dash", "expenses", "close"]);
    expect(visibleNavItems(items, rolesOf({ is_admin: true, is_manager: false })).map((i) => i.key)).toEqual(["dash", "expenses", "settings", "close"]);
  });
  it("shows only unrestricted items while roles are unknown", () => {
    expect(visibleNavItems(items, rolesOf(undefined)).map((i) => i.key)).toEqual(["dash", "expenses"]);
  });
});

describe("AppShell", () => {
  it("renders landmarks, mess name, role-filtered links and aria-current", async () => {
    me({ is_admin: false, is_manager: false });
    renderWithProviders(
      <AppShell items={items}>
        <p>page body</p>
      </AppShell>,
      { messId: 7 },
    );
    expect(screen.getByRole("main")).toHaveTextContent("page body");
    expect((await screen.findAllByText("Green House")).length).toBeGreaterThan(0);
    const sidebar = screen.getByRole("navigation", { name: "Main navigation" });
    const links = sidebar.querySelectorAll("a");
    expect([...links].map((a) => a.getAttribute("href"))).toEqual(["/7", "/7/expenses"]);
    // The dashboard (`/7`) is a prefix of every page but must not light up on them.
    const active = sidebar.querySelectorAll('a[aria-current="page"]');
    expect([...active].map((a) => a.getAttribute("href"))).toEqual(["/7/expenses"]);
    expect(screen.queryByRole("link", { name: /Mess Hisab/ })).toBeNull();
  });

  it("shows admin items for an admin", async () => {
    me({ is_admin: true, is_manager: false });
    renderWithProviders(<AppShell items={items}>x</AppShell>, { messId: 7 });
    await screen.findAllByText("Green House");
    const sidebar = screen.getByRole("navigation", { name: "Main navigation" });
    expect(sidebar.querySelectorAll("a").length).toBe(4);
  });

  it("works with zero items and in Bangla", async () => {
    me({ is_admin: false, is_manager: false });
    renderWithProviders(<AppShell items={[]}>hello</AppShell>, { messId: 7, locale: "bn" });
    expect(screen.getByRole("main")).toHaveTextContent("hello");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getAllByRole("button", { name: "বাংলা" }).length).toBeGreaterThan(0);
    expectBanglaOnly(["English", "hello"]);
  });

  it("keeps content clear of the fixed bottom nav (safe area) and scrolls many tabs sideways", async () => {
    me({ is_admin: true, is_manager: true });
    renderWithProviders(<AppShell items={items}>x</AppShell>, { messId: 7 });
    await screen.findAllByText("Green House");
    expect(screen.getByRole("main").className).toContain("env(safe-area-inset-bottom)");
    const bottom = screen.getAllByRole("navigation").find((n) => n.className.includes("fixed"));
    expect(bottom?.className).toContain("env(safe-area-inset-bottom)");
    expect(bottom?.querySelector("ul")?.className).toContain("overflow-x-auto");
  });
});
