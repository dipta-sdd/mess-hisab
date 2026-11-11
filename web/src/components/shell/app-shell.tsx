"use client";

import { Button, Drawer } from "@heroui/react";
import { Link } from "@/lib/nav";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { QuickAddButton, QuickAddExpense, QuickAddFab } from "@/features/expenses/quick-add";
import { navRegistry } from "@/features/nav-registry";
import type { NavItem } from "@/features/types";
import { useMe } from "@/lib/api-client/auth";
import { LanguageSwitcher } from "@/lib/i18n/language-switcher";
import { ThemeToggle } from "@/lib/theme";
import { useMess } from "@/lib/mess/mess-context";
import { AccountMenu } from "./account-links";
import { NavIcon } from "./nav-icon";
import { rolesOf, visibleNavItems } from "./nav-items";

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  // The mess root (`/7`) and the admin root (`/7/admin`) are prefixes of other pages, so they only match exactly.
  const parts = href.split("/").filter(Boolean);
  const isRoot = parts.length === 1 || (parts.length === 2 && parts[1] === "admin");
  return !isRoot && pathname.startsWith(`${href}/`);
}

function NavLinks({
  items,
  messId,
  memberId,
  variant,
  onNavigate,
}: {
  items: NavItem[];
  messId: number;
  memberId?: number;
  variant: "side" | "bottom" | "top";
  onNavigate?: () => void;
}) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <ul className={variant === "side" ? "flex flex-col gap-1" : variant === "top" ? "flex items-center gap-1" : "flex h-full items-stretch"}>
      {items.map((item) => {
        const href = item.href(messId, memberId);
        const active = isActive(pathname, href);
        return (
          <li key={item.key} className={variant === "bottom" ? "min-w-0 flex-1" : undefined}>
            <Link
              href={href}
              onClick={onNavigate}
              title={variant === "bottom" ? t(item.labelKey) : undefined}
              aria-current={active ? "page" : undefined}
              className={
                variant === "side" || variant === "top"
                  ? `flex min-h-11 items-center gap-${variant === "top" ? "2" : "3"} rounded-lg px-3 py-2 text-sm font-medium ${
                      active ? "bg-accent text-accent-foreground" : "hover:bg-default"
                    }`
                  : `flex h-full min-h-11 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs leading-tight ${
                      active ? "border-t-2 border-accent font-semibold text-accent" : "border-t-2 border-transparent text-foreground/75"
                    }`
              }
            >
              <NavIcon name={item.icon} />
              <span className={variant === "bottom" ? "line-clamp-2 max-w-full text-center break-words" : undefined}>{t(item.labelKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Responsive shell. Everyone gets the same member links (`place: "bar"`): a bottom bar on phones, a
 * top bar from md up. Staff (admin or manager) also get the admin pages (`place: "admin"`): a left
 * sidebar from md up, a ☰ side menu on phones. The header carries the mess name, quick-add,
 * language, theme and account menu at every width. Items come from the nav registry, filtered by role.
 */
export function AppShell({ children, items = navRegistry }: { children: React.ReactNode; items?: NavItem[] }) {
  const t = useTranslations("common");
  const { messId } = useMess();
  const me = useMe();

  const membership = me.data?.memberships.find((m) => m.mess_id === messId);
  const messName = membership?.mess_name;
  const roles = useMemo(() => rolesOf(membership), [membership]);
  const isStaff = roles.has("admin") || roles.has("manager");
  const visible = useMemo(() => visibleNavItems(items, roles), [items, roles]);
  // "My statement" needs the member id, so it waits for the membership.
  const barItems = visible.filter((item) => item.place === "bar" && (item.key !== "my-statement" || membership));
  const adminItems = isStaff ? visible.filter((item) => item.place === "admin") : [];
  const memberId = membership?.member_id;

  // Quick-add needs the nav (same gate as the bars), an active membership, and a page without its own
  // add flow: Expenses has an always-open form (and duplicate form ids would clash), Meals has a save bar.
  const pathname = usePathname() ?? "";
  const underPage = (page: string) =>
    [`/${messId}/${page}`, `/${messId}/admin/${page}`].some((base) => pathname === base || pathname.startsWith(`${base}/`));
  const canQuickAdd = visible.length > 0 && Boolean(membership) && !membership?.archived && !underPage("expenses");
  const showFab = canQuickAdd && !underPage("meals");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  // The shell stays mounted between pages, so the side menu closes itself when a link is followed.
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSidebar = adminItems.length > 0;

  const header = (
    <div className="min-w-0">
      <p className="truncate text-base font-semibold">{messName ?? t("shell.messFallback")}</p>
      {membership?.archived ? <p className="text-sm text-muted">{t("shell.archived")}</p> : null}
    </div>
  );

  return (
    <div className="min-h-dvh bg-background text-foreground md:flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-foreground"
      >
        {t("shell.skipToContent")}
      </a>

      {hasSidebar ? (
      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-e border-border p-4 md:flex">
        <nav aria-label={t("shell.adminNav")}>
          <NavLinks items={adminItems} messId={messId} variant="side" />
        </nav>
      </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {hasSidebar ? (
              <Drawer isOpen={menuOpen} onOpenChange={setMenuOpen}>
                <Button isIconOnly variant="ghost" aria-label={t("shell.openMenu")} className="size-11 shrink-0 md:hidden">
                  <NavIcon name="menu" />
                </Button>
                <Drawer.Backdrop>
                  <Drawer.Content placement="left" className="w-72 max-w-[85vw]">
                    <Drawer.Dialog aria-label={t("shell.menu")} className="flex h-full flex-col gap-4 overflow-y-auto p-4">
                      {header}
                      <nav aria-label={t("shell.adminNav")}>
                        <NavLinks items={adminItems} messId={messId} variant="side" onNavigate={() => setMenuOpen(false)} />
                      </nav>
                    </Drawer.Dialog>
                  </Drawer.Content>
                </Drawer.Backdrop>
              </Drawer>
            ) : null}
            {header}
          </div>
          {barItems.length > 0 ? (
            <nav aria-label={t("shell.topNav")} className="hidden min-w-0 flex-1 md:block">
              <NavLinks items={barItems} messId={messId} memberId={memberId} variant="top" />
            </nav>
          ) : null}
          <div className="flex shrink-0 items-center gap-2">
            {canQuickAdd ? (
              <>
                <span className="md:hidden">
                  <QuickAddButton variant="top" onPress={() => setQuickAddOpen(true)} />
                </span>
                <span className="hidden w-36 md:block">
                  <QuickAddButton variant="side" onPress={() => setQuickAddOpen(true)} />
                </span>
              </>
            ) : null}
            <span className="hidden md:block">
              <LanguageSwitcher compact />
            </span>
            <ThemeToggle />
            <AccountMenu messId={messId} />
          </div>
        </header>
        <OfflineBanner />
        <main id="main-content" className={`min-w-0 flex-1 p-4 md:p-6 ${barItems.length > 0 ? "pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-6" : ""}`}>
          {children}
        </main>
      </div>

      {barItems.length > 0 ? (
        <nav
          aria-label={t("shell.bottomNav")}
          className="fixed inset-x-0 bottom-0 z-40 md:hidden h-[calc(4.5rem+env(safe-area-inset-bottom))] border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto h-full max-w-xl">
            <NavLinks items={barItems} messId={messId} memberId={memberId} variant="bottom" />
          </div>
        </nav>
      ) : null}
      {showFab ? <QuickAddFab onPress={() => setQuickAddOpen(true)} /> : null}
      {canQuickAdd ? <QuickAddExpense messId={messId} isOpen={quickAddOpen} onOpenChange={setQuickAddOpen} /> : null}
    </div>
  );
}
