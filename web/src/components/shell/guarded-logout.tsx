"use client";

import { Button, Modal } from "@heroui/react";
import { useRouter } from "@/lib/nav";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useLogout } from "@/features/auth";
import { countQueued } from "@/lib/offline/queue";

/**
 * Log out, but first warn when expenses saved offline have not synced yet: they stay on this phone,
 * and only reach the server after the same person logs in again online.
 */
export function useGuardedLogout() {
  const t = useTranslations("common.logoutWarning");
  const logout = useLogout();
  const router = useRouter();
  const [waiting, setWaiting] = useState(0);
  const [open, setOpen] = useState(false);

  const leave = () => logout.mutate(undefined, { onSuccess: () => router.replace("/login") });
  const run = async () => {
    const n = await countQueued();
    if (n === 0) return leave();
    setWaiting(n);
    setOpen(true);
  };

  const dialog = (
    <Modal isOpen={open} onOpenChange={setOpen}>
      <Modal.Backdrop>
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog aria-label={t("title")} className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <p className="text-sm text-muted">{t("body", { count: waiting })}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onPress={() => setOpen(false)}>{t("stay")}</Button>
              <Button
                variant="danger"
                onPress={() => {
                  setOpen(false);
                  leave();
                }}
              >
                {t("leave")}
              </Button>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );

  return { isPending: logout.isPending, isError: logout.isError, run, dialog };
}
