import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  { key: "settings", href: (id) => `/${id}/settings`, labelKey: "app.name", icon: "settings", place: "admin", roles: ["admin"], order: 30 },
  { key: "expenses", href: (id) => `/${id}/expenses`, labelKey: "common.shell.messFallback", icon: "expenses", place: "bar", order: 20 },
  { key: "dash", href: (id) => `/${id}`, labelKey: "common.language.label", icon: "dashboard", place: "bar", order: 10 },
  { key: "close", href: (id) => `/${id}/close`, labelKey: "common.balance.settled", icon: "months", place: "admin", roles: ["manager", "admin"], order: 40 },
];

function me(flags: { is_admin: boolean; is_manager: boolean }) {
  server.use(
    http.get(`${API_BASE_URL}/api/auth/me`, () =>
      HttpResponse.json({
        user: { id: 1, name: "A", email: "a@x.com", phone: "01700000001", phone_verified: true, has_verified_contact: true, locale: "en", has_password: true, has_google: false },
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
  it("renders landmarks and mess name; a member has the bottom bar but no sidebar or menu", async () => {
    me({ is_admin: false, is_manager: false });
    renderWithProviders(
      <AppShell items={items}>
        <p>page body</p>
      </AppShell>,
      { messId: 7 },
    );
    expect(screen.getByRole("main")).toHaveTextContent("page body");
    expect((await screen.findAllByText("Green House")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("navigation", { name: "Admin navigation" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open menu" })).toBeNull();
    // The same links sit in a top bar from md up.
    const top = screen.getByRole("navigation", { name: "Main navigation (top bar)" });
    expect([...top.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/7", "/7/expenses"]);
    const bottom = screen.getByRole("navigation", { name: "Main navigation (bottom bar)" });
    expect([...bottom.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/7", "/7/expenses"]);
    // The dashboard (`/7`) is a prefix of every page but must not light up on them.
    expect([...bottom.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute("href"))).toEqual(["/7/expenses"]);
    // Header for a member: language switcher and account menu are reachable at every width.
    expect(screen.getByRole("button", { name: /Language/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Your account" })).toBeTruthy();
  });

  it("gives staff the admin items in the sidebar and the phone menu, and the bar only the everyday pages", async () => {
    me({ is_admin: false, is_manager: true });
    renderWithProviders(<AppShell items={items}>x</AppShell>, { messId: 7 });
    await screen.findAllByText("Green House");
    const sidebar = screen.getByRole("navigation", { name: "Admin navigation" });
    expect([...sidebar.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/7/close"]);
    const bottom = screen.getByRole("navigation", { name: "Main navigation (bottom bar)" });
    expect([...bottom.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/7", "/7/expenses"]);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = await screen.findByRole("dialog", { name: "Menu" });
    expect([...menu.querySelectorAll("nav a")].map((a) => a.getAttribute("href"))).toEqual(["/7/close"]);
    await user.click(menu.querySelector('a[href="/7/close"]')!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows Settings only to an admin", async () => {
    me({ is_admin: true, is_manager: false });
    renderWithProviders(<AppShell items={items}>x</AppShell>, { messId: 7 });
    await screen.findAllByText("Green House");
    const sidebar = screen.getByRole("navigation", { name: "Admin navigation" });
    expect([...sidebar.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/7/settings", "/7/close"]);
  });

  it("with the real registry: everyone gets 5 bar items incl. My statement; staff get the admin pages", async () => {
    me({ is_admin: false, is_manager: false });
    const { unmount } = renderWithProviders(<AppShell>x</AppShell>, { messId: 7 });
    const bottom = await screen.findByRole("navigation", { name: "Main navigation (bottom bar)" });
    await waitFor(() => expect(bottom.querySelectorAll("a")).toHaveLength(5));
    expect([...bottom.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/7", "/7/meals", "/7/expenses", "/7/payments", "/7/statements/3"]);
    expect(bottom.querySelector('a[href="/7/statements/3"]')).toHaveTextContent("My statement");
    expect(screen.queryByRole("navigation", { name: "Admin navigation" })).toBeNull();
    unmount();

    me({ is_admin: false, is_manager: true });
    renderWithProviders(<AppShell>x</AppShell>, { messId: 7 });
    const sidebar = await screen.findByRole("navigation", { name: "Admin navigation" });
    await waitFor(() => expect(sidebar.querySelectorAll("a").length).toBeGreaterThan(0));
    const hrefs = [...sidebar.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/7/admin", "/7/admin/meals", "/7/admin/expenses", "/7/admin/payments", "/7/admin/fixed", "/7/admin/members", "/7/admin/statements", "/7/admin/months", "/7/admin/audit"]);
    expect(screen.getByRole("navigation", { name: "Main navigation (bottom bar)" }).querySelectorAll("a")).toHaveLength(5);
  });

  it("works with zero items and in Bangla", async () => {
    me({ is_admin: false, is_manager: false });
    renderWithProviders(<AppShell items={[]}>hello</AppShell>, { messId: 7, locale: "bn" });
    expect(screen.getByRole("main")).toHaveTextContent("hello");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("button", { name: "ভাষা: English" })).toHaveTextContent("EN");
    expectBanglaOnly(["English", "EN", "hello", "A"]);
  });

  it("keeps content clear of the fixed bottom nav (safe area) at every width", async () => {
    me({ is_admin: true, is_manager: true });
    renderWithProviders(<AppShell items={items}>x</AppShell>, { messId: 7 });
    await screen.findAllByText("Green House");
    expect(screen.getByRole("main").className).toContain("env(safe-area-inset-bottom)");
    expect(screen.getByRole("main").className).toContain("md:pb-6");
    const bottom = screen.getByRole("navigation", { name: "Main navigation (bottom bar)" });
    expect(bottom.className).toContain("env(safe-area-inset-bottom)");
    expect(bottom.className).toContain("md:hidden");
  });

  it("opens a phone account menu with profile, language and log out", async () => {
    me({ is_admin: false, is_manager: false });
    renderWithProviders(<AppShell items={items}>x</AppShell>, { messId: 7 });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Your account" }));
    const menu = await screen.findByRole("dialog", { name: "Your account" });
    expect(menu.querySelector('a[href="/7/profile"]')).toHaveTextContent("Profile");
    expect(menu.querySelector('a[href="/7/profile#email"]')).toHaveTextContent("Change email");
    expect(menu.querySelector('a[href="/7/profile#password"]')).toHaveTextContent("Change password");
    expect(menu.querySelector('[role="group"][aria-label="Language"]')).not.toBeNull();
    expect([...menu.querySelectorAll("button")].some((b) => b.textContent?.includes("Log out"))).toBe(true);

    await user.click(menu.querySelector('a[href="/7/profile"]')!);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
