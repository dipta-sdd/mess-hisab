"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { navRegistry } from "@/features/nav-registry";
import type { NavItem } from "@/features/types";
import { useMe } from "@/lib/api-client/auth";
import { LanguageSwitcher } from "@/lib/i18n/language-switcher";
import { useMess } from "@/lib/mess/mess-context";
import { NavIcon } from "./nav-icon";
import { rolesOf, visibleNavItems } from "./nav-items";

function isActive(pathname: string | null, href: string) {
  return !!pathname && (pathname === href || pathname.startsWith(`${href}/`));
}

function NavLinks({ items, messId, variant }: { items: NavItem[]; messId: number; variant: "side" | "bottom" }) {
  const t = useTranslations();
  const pathname = usePathname();

  return (
    <ul className={variant === "side" ? "flex flex-col gap-1" : "flex items-stretch justify-around gap-1 overflow-x-auto"}>
      {items.map((item) => {
        const href = item.href(messId);
        const active = isActive(pathname, href);
        return (
          <li key={item.key} className={variant === "bottom" ? "min-w-16 flex-1" : undefined}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={
                variant === "side"
                  ? `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                      active ? "bg-accent text-accent-foreground" : "hover:bg-default"
                    }`
                  : `flex h-full flex-col items-center justify-center gap-0.5 px-2 py-2 text-xs ${
                      active ? "font-semibold text-accent" : "text-muted"
                    }`
              }
            >
              <NavIcon name={item.icon} />
              <span>{t(item.labelKey)}</span>
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
        <main id="main-content" className={`flex-1 p-4 md:p-6 ${visible.length > 0 ? "pb-24 md:pb-6" : ""}`}>
          {children}
        </main>
      </div>

      {visible.length > 0 ? (
        <nav
          aria-label={t("shell.bottomNav")}
          className="fixed inset-x-0 bottom-0 z-40 h-16 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          <NavLinks items={visible} messId={messId} variant="bottom" />
        </nav>
      ) : null}
    </div>
  );
}
