"use client";

import { Button, Popover } from "@heroui/react";
import { Link } from "@/lib/nav";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useMe } from "@/lib/api-client/auth";
import { LanguageSwitcher } from "@/lib/i18n/language-switcher";
import { useInstall } from "@/components/pwa/install-context";
import { useGuardedLogout } from "./guarded-logout";
import { NavIcon } from "./nav-icon";

function Initial({ name }: { name?: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-soft-foreground"
    >
      {(name?.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Sidebar footer: one row, who is signed in (links to the profile page) and a log out icon. */
export function SidebarAccount({ messId }: { messId: number }) {
  const t = useTranslations("common.shell");
  const me = useMe();
  const logout = useGuardedLogout();
  const pathname = usePathname();
  const href = `/${messId}/profile`;
  const active = pathname === href;
  const name = me.data?.user.name;

  return (
    <div className="flex items-center gap-1 border-t border-border pt-3" aria-label={t("account")} role="group">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium ${
          active ? "bg-accent text-accent-foreground" : "hover:bg-default"
        }`}
      >
        <Initial name={name} />
        <span className="min-w-0">
          <span className="block truncate">{name ?? t("profile")}</span>
          <span className={`block text-sm ${active ? "" : "text-muted"}`}>{t("profile")}</span>
        </span>
      </Link>
      <Button
        isIconOnly
        variant="ghost"
        aria-label={t("logout")}
        className="size-11 shrink-0 text-danger"
        isPending={logout.isPending}
        onPress={logout.run}
      >
        <NavIcon name="logout" />
      </Button>
      {logout.dialog}
    </div>
  );
}

/** Phone top bar: the user's initial opens a small menu with profile, language and log out. */
export function AccountMenu({ messId }: { messId: number }) {
  const t = useTranslations("common");
  const ti = useTranslations("app.install");
  const me = useMe();
  const logout = useGuardedLogout();
  const install = useInstall();
  const [showSteps, setShowSteps] = useState(false);
  const name = me.data?.user.name;
  // The shell stays mounted between pages, so close the menu when its profile link is followed.
  const [open, setOpen] = useState(false);

  return (
    <>
    <Popover isOpen={open} onOpenChange={setOpen}>
      <Button isIconOnly variant="ghost" aria-label={t("shell.account")} className="size-11 rounded-full">
        <Initial name={name} />
      </Button>
      <Popover.Content placement="bottom end" className="w-60">
        <Popover.Dialog aria-label={t("shell.account")} className="flex flex-col gap-1 p-2">
          {name ? <p className="truncate px-3 pb-1 pt-2 text-sm font-semibold">{name}</p> : null}
          {(
            [
              ["profile", "", "shell.profile"],
              ["mail", "#email", "profile.menuEmail"],
              ["lock", "#password", "profile.menuPassword"],
            ] as const
          ).map(([icon, hash, label]) => (
            <Link
              key={icon}
              href={`/${messId}/profile${hash}`}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-default"
            >
              <NavIcon name={icon} />
              {t(label)}
            </Link>
          ))}
          <div className="flex items-center justify-between gap-2 px-3 py-1">
            <span className="text-sm text-muted">{t("language.label")}</span>
            <LanguageSwitcher />
          </div>
          <div className="my-1 border-t border-border" />
          {install.canPrompt || install.needsManualSteps ? (
            <>
              <Button
                variant="ghost"
                className="min-h-11 justify-start gap-3 px-3"
                onPress={() => {
                  if (install.canPrompt) {
                    setOpen(false);
                    void install.prompt();
                  } else {
                    setShowSteps((v) => !v);
                  }
                }}
              >
                <NavIcon name="install" />
                {ti("menu")}
              </Button>
              {showSteps && !install.canPrompt ? <p className="px-3 pb-2 text-sm text-muted">{install.ios ? ti("iosSteps") : ti("otherSteps")}</p> : null}
            </>
          ) : null}
          <Button
            variant="ghost"
            className="min-h-11 justify-start gap-3 px-3 text-danger"
            isPending={logout.isPending}
            onPress={logout.run}
          >
            <NavIcon name="logout" />
            {t("shell.logout")}
          </Button>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
    {logout.dialog}
    </>
  );
}
