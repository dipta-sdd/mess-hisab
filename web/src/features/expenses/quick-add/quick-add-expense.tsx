"use client";

import { Button, Modal } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AppLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { useCategories, useMembers, useMessInfo, type CreateResult } from "../api";
import { ExpenseForm } from "../expense-form";
import { hasSavedNotes, SavedPanel, type SavedResult } from "./saved-panel";

const DESKTOP = "(min-width: 768px)";

/** Bottom sheet on phones, centred dialog from md up. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP) : null;
      mq?.addEventListener("change", notify);
      return () => mq?.removeEventListener("change", notify);
    },
    () => (typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP).matches : true),
    () => true,
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Round "+" button above the phone bottom nav. */
export function QuickAddFab({ onPress }: { onPress: () => void }) {
  const t = useTranslations("expenses.quickAdd");
  return (
    <Button
      isIconOnly
      variant="primary"
      onPress={onPress}
      aria-label={t("addExpense")}
      className="fixed end-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 size-14 min-h-14 min-w-14 rounded-full shadow-lg md:hidden"
    >
      <PlusIcon className="size-7" />
    </Button>
  );
}

/** "+ Expense" button for the sidebar (with label) and the phone top bar (icon only). */
export function QuickAddButton({ onPress, variant }: { onPress: () => void; variant: "side" | "top" }) {
  const t = useTranslations("expenses.quickAdd");
  return variant === "side" ? (
    <Button variant="primary" onPress={onPress} className="min-h-11 w-full justify-start">
      <PlusIcon className="size-5" />
      {t("button")}
    </Button>
  ) : (
    <Button isIconOnly variant="primary" onPress={onPress} aria-label={t("addExpense")} className="size-11 min-h-11 min-w-11">
      <PlusIcon className="size-5" />
    </Button>
  );
}

/**
 * The shared "add expense" dialog. Focus returns to whatever opened it on close (React Aria restores it)
 * and Escape closes. Data loads only while it is open.
 */
export function QuickAddExpense({ messId, isOpen, onOpenChange }: { messId: number; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("expenses.quickAdd");
  const desktop = useIsDesktop();
  const [toast, setToast] = useState(false);

  // The project has no toast system: a short status line stands in for one.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(false), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Backdrop>
          <Modal.Container placement={desktop ? "center" : "bottom"} size="md">
            <Modal.Dialog aria-label={t("dialogTitle")} className="max-h-[92dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <QuickAddBody messId={messId} onClose={() => onOpenChange(false)} onQuietSave={() => setToast(true)} />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
      <p
        role="status"
        className={toast ? "fixed inset-x-4 top-4 z-50 mx-auto w-fit rounded-lg bg-success px-4 py-2 text-sm font-medium text-success-foreground shadow-lg" : "sr-only"}
      >
        {toast ? t("savedToast") : ""}
      </p>
    </>
  );
}

function QuickAddBody({ messId, onClose, onQuietSave }: { messId: number; onClose: () => void; onQuietSave: () => void }) {
  const t = useTranslations("expenses.quickAdd");
  const locale = useLocale() as AppLocale;
  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const categoriesQ = useCategories(messId);
  const [saved, setSaved] = useState<SavedResult | null>(null);

  const mess = messQ.data?.mess;
  const me = messQ.data?.me;

  if (messQ.isError || membersQ.isError || categoriesQ.isError) {
    return (
      <p role="alert" className="p-4 text-danger">
        {t("loadFailed")}
      </p>
    );
  }
  if (!me || !mess || !membersQ.data || !categoriesQ.data) {
    return (
      <p role="status" className="p-4 text-muted">
        {t("loading")}
      </p>
    );
  }
  const members = membersQ.data;
  const categories = categoriesQ.data;

  if (saved) {
    return (
      <div className="p-4">
        <SavedPanel
          saved={saved}
          categoryName={(id) => categories.find((c) => c.id === id)?.name ?? ""}
          money={(paisa) => formatMoney(paisa, locale, mess.rounding_mode ?? "two_decimals")}
          onDismiss={onClose}
          dismissLabel={t("done")}
        />
      </div>
    );
  }

  return (
    <ExpenseForm
      messId={messId}
      me={me}
      members={members}
      categories={categories}
      onCancel={onClose}
      onQueued={() => {
        onQuietSave();
        onClose();
      }}
      onSaved={(result: CreateResult) => {
        const next = { ...result, edited: false };
        if (hasSavedNotes(next)) return setSaved(next);
        onQuietSave();
        onClose();
      }}
    />
  );
}
