"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { navRegistry } from "@/features/nav-registry";
import type { NavItem } from "@/features/types";
import { useMe } from "@/lib/api-client/auth";
import { LanguageSwitcher } from "@/lib/i18n/language-switcher";
import { useMess } from "@/lib/mess/mess-context";
import { NavIcon } from "./nav-icon";
import { rolesOf, visibleNavItems } from "./nav-items";

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  // The mess root (`/7`, the dashboard) is a prefix of every page, so it only matches exactly.
  const isMessRoot = href.split("/").filter(Boolean).length === 1;
  return !isMessRoot && pathname.startsWith(`${href}/`);
}

function NavLinks({ items, messId, variant }: { items: NavItem[]; messId: number; variant: "side" | "bottom" }) {
  const t = useTranslations();
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // With many items the bottom bar scrolls sideways; keep the current page's tab on screen.
  useEffect(() => {
    if (variant === "bottom") activeRef.current?.scrollIntoView?.({ inline: "center", block: "nearest" });
  }, [variant, pathname]);

  return (
    <ul
      className={
        variant === "side"
          ? "flex flex-col gap-1"
          : "flex h-full items-stretch gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      }
    >
      {items.map((item) => {
        const href = item.href(messId);
        const active = isActive(pathname, href);
        return (
          <li key={item.key} className={variant === "bottom" ? "min-w-[4.5rem] flex-1" : undefined}>
            <Link
              href={href}
              ref={active ? activeRef : undefined}
              title={variant === "bottom" ? t(item.labelKey) : undefined}
              aria-current={active ? "page" : undefined}
              className={
                variant === "side"
                  ? `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                      active ? "bg-accent text-accent-foreground" : "hover:bg-default"
                    }`
                  : `flex h-full min-h-11 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[11px] leading-tight ${
                      active ? "border-t-2 border-accent font-semibold text-accent" : "border-t-2 border-transparent text-muted"
                    }`
              }
            >
              <NavIcon name={item.icon} />
              <span className={variant === "bottom" ? "block max-w-full truncate" : undefined}>{t(item.labelKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Responsive shell: sidebar from md up, bottom nav on phones. Items come from the nav registry,
 * filtered by the current member's roles. Works with zero items.
 */
export function AppShell({ children, items = navRegistry }: { children: React.ReactNode; items?: NavItem[] }) {
  const t = useTranslations("common");
  const { messId } = useMess();
  const me = useMe();

  const membership = me.data?.memberships.find((m) => m.mess_id === messId);
  const messName = membership?.mess_name;
  const visible = useMemo(() => visibleNavItems(items, rolesOf(membership)), [items, membership]);

  const header = (
    <div className="min-w-0">
      <p className="truncate text-base font-semibold">{messName ?? t("shell.messFallback")}</p>
      {membership?.archived ? <p className="text-xs text-muted">{t("shell.archived")}</p> : null}
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

      <aside className="hidden w-64 shrink-0 flex-col gap-4 border-e border-border p-4 md:flex">
        <header>{header}</header>
        {visible.length > 0 ? (
          <nav aria-label={t("shell.sidebarNav")}>
            <NavLinks items={visible} messId={messId} variant="side" />
          </nav>
        ) : null}
        <div className="mt-auto">
          <LanguageSwitcher />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 md:hidden">
          {header}
          <LanguageSwitcher />
        </header>
        <main id="main-content" className={`min-w-0 flex-1 p-4 md:p-6 ${visible.length > 0 ? "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-6" : ""}`}>
          {children}
        </main>
      </div>

      {visible.length > 0 ? (
        <nav
          aria-label={t("shell.bottomNav")}
          className="fixed inset-x-0 bottom-0 z-40 h-[calc(4rem+env(safe-area-inset-bottom))] border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <NavLinks items={visible} messId={messId} variant="bottom" />
        </nav>
      ) : null}
    </div>
  );
}
