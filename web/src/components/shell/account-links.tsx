"use client";

import { Button } from "@heroui/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLogout } from "@/features/auth";
import { useMe } from "@/lib/api-client/auth";
import { NavIcon } from "./nav-icon";

/** Sidebar footer: who is signed in (links to the profile page) and a log out button. */
export function SidebarAccount({ messId }: { messId: number }) {
  const t = useTranslations("common.shell");
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();
  const pathname = usePathname();
  const href = `/${messId}/profile`;
  const active = pathname === href;

  return (
    <div className="flex flex-col gap-1 border-t border-border pt-3" aria-label={t("account")} role="group">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
          active ? "bg-accent text-accent-foreground" : "hover:bg-default"
        }`}
      >
        <NavIcon name="profile" />
        <span className="min-w-0">
          <span className="block truncate">{me.data?.user.name ?? t("profile")}</span>
          <span className={`block text-xs ${active ? "" : "text-muted"}`}>{t("profile")}</span>
        </span>
      </Link>
      <Button
        variant="ghost"
        className="min-h-11 justify-start gap-3 px-3"
        isPending={logout.isPending}
        onPress={() => logout.mutate(undefined, { onSuccess: () => router.replace("/login") })}
      >
        <NavIcon name="logout" />
        {t("logout")}
      </Button>
    </div>
  );
}

/** Phone top bar: a round button to the profile page (log out lives there). */
export function ProfileIconLink({ messId }: { messId: number }) {
  const t = useTranslations("common.shell");
  return (
    <Link
      href={`/${messId}/profile`}
      aria-label={t("profile")}
      title={t("profile")}
      className="flex size-11 items-center justify-center rounded-full hover:bg-default"
    >
      <NavIcon name="profile" />
    </Link>
  );
}
