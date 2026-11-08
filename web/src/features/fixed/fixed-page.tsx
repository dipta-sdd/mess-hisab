"use client";

import { Accordion, Button, Modal } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import { formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useCategories, useCreateCategory, useCurrentMonth, useMembers, useMessInfo, useMonths, useSetup } from "./api";
import { AddBillForm } from "./add-bill-form";
import { BillCard } from "./bill-card";
import { explainError } from "./errors";
import { MemberSettingRow, MonthSetupForm } from "./month-forms";
import { formatDate } from "@/lib/format";
import { formatMonthLabel } from "@/lib/format/date";

export function FixedPage() {
  const { messId } = useMess();
  const t = useTranslations("fixed");
  const locale = useLocale() as AppLocale;

  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const monthsQ = useMonths(messId);
  const currentQ = useCurrentMonth(messId);
  const categoriesQ = useCategories(messId);

  // The report's "set next month's bills" link opens a given month with `?month=<id>`.
  const linkedMonth = Number(useSearchParams()?.get("month")) || null;
  const [pickedMonth, setPickedMonth] = useState<number | null>(linkedMonth);
  const [editingMonth, setEditingMonth] = useState(false);
  const [addingBill, setAddingBill] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const createCategory = useCreateCategory(messId);
  const months = monthsQ.data ?? [];
  const monthId = pickedMonth ?? currentQ.data?.id ?? (currentQ.isError ? (months[0]?.id ?? null) : null);
  const setupQ = useSetup(messId, monthId);
  // Months come newest first, so the "older" neighbour is the next index.
  const at = months.findIndex((m) => m.id === monthId);
  const olderMonth = at >= 0 ? months[at + 1] : undefined;
  const newerMonth = at > 0 ? months[at - 1] : undefined;

  const mess = messQ.data?.mess;
  const isManager = Boolean(messQ.data?.me.is_manager);
  const mode = mess?.rounding_mode ?? "two_decimals";
  const money = (paisa: number) => formatMoney(paisa, locale, mode);

  const setup = setupQ.data;
  const month = setup?.month;
  const canEdit = isManager && month?.status === "open";
  const members = (membersQ.data ?? []).filter(
    (m) => month && m.joined_on <= month.ends_on && (m.left_on === null || m.left_on >= month.starts_on),
  );
  const categoryName = (id: number) => categoriesQ.data?.find((c) => c.id === id)?.name ?? t("bill.unknownCategory");
  // By-meal food is split by the meal engine, not by hand, so it has no setup here.
  const bills = (setup?.bills ?? []).filter((b) => b.split_type !== "by_meal");
  const hasByMeal = (setup?.bills ?? []).some((b) => b.split_type === "by_meal");

  const loading = messQ.isPending || membersQ.isPending || monthsQ.isPending || currentQ.isPending || categoriesQ.isPending || (monthId !== null && setupQ.isPending);
  const loadFailed = messQ.isError || membersQ.isError || monthsQ.isError || categoriesQ.isError || setupQ.isError || (currentQ.isError && months.length === 0 && !monthsQ.isPending);

  return (
    <div className="flex w-full flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="flex items-center gap-1" data-testid="month-stepper">
        <Button isIconOnly variant="ghost" aria-label={t("monthPicker.prev")} isDisabled={!olderMonth} onPress={() => olderMonth && setPickedMonth(olderMonth.id)} className="size-11">
          <span aria-hidden="true">‹</span>
        </Button>
        <div className="min-w-36 text-center">
          <p className="font-semibold">{month ? formatMonthLabel(month.starts_on, locale) : "…"}</p>
          {month ? <p className="text-sm text-muted">{month.status === "open" ? t("monthPicker.open") : t("monthPicker.closed")}</p> : null}
        </div>
        <Button isIconOnly variant="ghost" aria-label={t("monthPicker.next")} isDisabled={!newerMonth} onPress={() => newerMonth && setPickedMonth(newerMonth.id)} className="size-11">
          <span aria-hidden="true">›</span>
        </Button>
      </div>

      {loadFailed ? (
        <p role="alert" className="text-danger">{t("errors.loadFailed")}</p>
      ) : loading ? (
        <p role="status" className="text-muted">{t("loading")}</p>
      ) : monthId === null || !month ? (
        <p className="text-muted">{t("errors.noMonth")}</p>
      ) : (
        <>
          {month.status === "closed" ? (
            <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm" data-testid="closed-note">{t("closedNote")}</p>
          ) : !isManager ? (
            <p role="status" className="rounded-lg border border-border bg-surface p-3 text-sm" data-testid="readonly-note">{t("readOnlyNote")}</p>
          ) : null}

          <section aria-labelledby="fx-month-title" className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="min-w-0">
              <h2 id="fx-month-title" className="text-lg font-semibold">{t("month.title")}</h2>
              <dl className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3" data-testid="month-setup-readonly">
                <div><dt className="text-muted">{t("month.deposit")}</dt><dd className="font-medium">{money(month.deposit_paisa)}</dd></div>
                <div><dt className="text-muted">{t("month.fixedDeadline")}</dt><dd className="font-medium">{month.fixed_deadline ? formatDate(month.fixed_deadline, locale) : t("month.none")}</dd></div>
                <div><dt className="text-muted">{t("month.depositDeadline")}</dt><dd className="font-medium">{month.deposit_deadline ? formatDate(month.deposit_deadline, locale) : t("month.none")}</dd></div>
              </dl>
            </div>
            {canEdit ? (
              <>
                <Button variant="secondary" className="min-h-11" onPress={() => setEditingMonth(true)}>{t("actions.editMonth")}</Button>
                <Modal isOpen={editingMonth} onOpenChange={setEditingMonth}>
                  <Modal.Backdrop>
                    <Modal.Container placement="center" size="md">
                      <Modal.Dialog aria-label={t("month.title")} className="max-h-[92dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <MonthSetupForm
                          key={`${month.id}:${month.fixed_deadline}:${month.deposit_deadline}:${month.deposit_paisa}`}
                          messId={messId}
                          month={month}
                          canEdit
                          money={money}
                          onSaved={() => setEditingMonth(false)}
                        />
                      </Modal.Dialog>
                    </Modal.Container>
                  </Modal.Backdrop>
                </Modal>
              </>
            ) : null}
          </section>

          <section aria-labelledby="fx-bills-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="fx-bills-title" className="text-lg font-semibold">{t("bills.title")}</h2>
              {canEdit ? (
                <>
                  <Button variant="secondary" className="min-h-11" onPress={() => { setAddError(null); setAddingBill(true); }}>{t("addBill.open")}</Button>
                  <Modal isOpen={addingBill} onOpenChange={setAddingBill}>
                    <Modal.Backdrop>
                      <Modal.Container placement="center" size="md">
                        <Modal.Dialog aria-label={t("addBill.title")} className="max-h-[92dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                          <AddBillForm
                            pending={createCategory.isPending}
                            error={addError}
                            onCancel={() => setAddingBill(false)}
                            onSubmit={async (name, split_type) => {
                              setAddError(null);
                              try {
                                await createCategory.mutateAsync({ name, split_type });
                                setAddingBill(false);
                              } catch (error) {
                                setAddError(explainError(error, t));
                              }
                            }}
                          />
                        </Modal.Dialog>
                      </Modal.Container>
                    </Modal.Backdrop>
                  </Modal>
                </>
              ) : null}
            </div>
            {bills.length === 0 ? (
              <p className="text-muted">{t("bills.empty")}</p>
            ) : (
              <Accordion allowsMultipleExpanded className="overflow-hidden rounded-2xl border border-border bg-surface">
                {bills.map((bill) => (
                  <BillCard
                    key={`${bill.category_id}:${bill.amount_paisa}:${JSON.stringify(bill.overrides)}`}
                    messId={messId}
                    monthId={month.id}
                    bill={bill}
                    name={categoryName(bill.category_id)}
                    members={members}
                    canEdit={canEdit}
                    money={money}
                  />
                ))}
              </Accordion>
            )}
            {hasByMeal ? <p className="text-sm text-muted">{t("bills.byMealNote")}</p> : null}
          </section>

          <section aria-labelledby="fx-members-title" className="flex flex-col gap-2">
            <div>
              <h2 id="fx-members-title" className="text-lg font-semibold">{t("members.title")}</h2>
              <p className="text-sm text-muted">{t("members.hint")}</p>
            </div>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {members.map((m) => (
                <MemberSettingRow
                  key={`${m.id}:${JSON.stringify(setup?.member_settings.find((s) => s.member_id === m.id) ?? null)}`}
                  messId={messId}
                  month={month}
                  member={m}
                  setting={setup?.member_settings.find((s) => s.member_id === m.id)}
                  canEdit={canEdit}
                  money={money}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
