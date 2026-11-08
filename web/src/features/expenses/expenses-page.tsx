"use client";

import { Button, Modal } from "@heroui/react";
import { RowMenu } from "@/components/ui/row-menu";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { Expense, ExpenseStatus, Group, Member, Mess, Month } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useCategories, useCurrentMonth, useDeleteExpense, useExpenses, useMembers, useMessInfo, useMonths, usePendingExpenses, type CreateResult } from "./api";
import { ApprovalQueue } from "./approval-queue";
import { formatMonthLabel } from "@/lib/format/date";
import { ExpenseForm } from "./expense-form";
import { QueuedExpenses } from "./queued-expenses";
import { InstallBanner } from "@/components/pwa/install-banner";
import type { ExpenseInput } from "@/lib/api/contract";
import { ExpenseRow } from "./expense-row";
import { SavedPanel } from "./quick-add/saved-panel";
import { errorKey, expenseAbilities } from "./rules";
import { fieldClassInvalid } from "@/components/ui/field";

const STATUSES: ExpenseStatus[] = ["pending", "approved", "rejected"];

/** Expenses grouped by day, keeping the order the API returned them in. */
function byDay(expenses: Expense[]): Array<{ day: string; items: Expense[] }> {
  const days: Array<{ day: string; items: Expense[] }> = [];
  for (const e of expenses) {
    const last = days[days.length - 1];
    if (last && last.day === e.spent_on) last.items.push(e);
    else days.push({ day: e.spent_on, items: [e] });
  }
  return days;
}

/** `scope="own"` is the member page: just what the signed-in member recorded or paid, with member powers. `scope="all"` is the admin page. */
export function ExpensesPage({ scope = "own" }: { scope?: "own" | "all" }) {
  const { messId } = useMess();
  const t = useTranslations("expenses");
  const locale = useLocale() as AppLocale;

  const all = scope === "all";
  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const monthsQ = useMonths(messId);
  const currentQ = useCurrentMonth(messId);
  const categoriesQ = useCategories(messId);

  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const [status, setStatus] = useState<ExpenseStatus | null>(null);
  const [memberFilter, setMemberFilter] = useState<number | "cash" | "all" | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saved, setSaved] = useState<(CreateResult & { edited: boolean }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [prefill, setPrefill] = useState<ExpenseInput | null>(null);

  // Newest first, so "older" is the next index.
  const months = [...(monthsQ.data ?? [])].sort((a, b) => b.starts_on.localeCompare(a.starts_on));
  const monthId = pickedMonth ?? currentQ.data?.id ?? (currentQ.isError ? (months[0]?.id ?? null) : null);
  const month = months.find((m) => m.id === monthId) ?? (currentQ.data?.id === monthId ? currentQ.data : undefined);

  const mess = messQ.data?.mess;
  const realMe = messQ.data?.me;
  // The list starts on the signed-in member for a normal member, and on everyone for staff.
  const payer = memberFilter ?? (all ? "all" : (realMe?.id ?? "all"));
  const expensesQ = useExpenses(messId, { monthId: all || realMe ? monthId : null, status, payerId: typeof payer === "number" ? payer : null, categoryId: categoryFilter, paidBy: payer === "cash" ? "cash" : null });
  // On the member page a manager or admin is treated like any member: no cash expenses, no approvals.
  const me = realMe && !all ? { ...realMe, is_manager: false, is_admin: false } : realMe;
  const isStaff = all && Boolean(me?.is_manager || me?.is_admin);
  const pendingQ = usePendingExpenses(messId, isStaff);
  const mode = mess?.rounding_mode ?? "two_decimals";
  const members = membersQ.data ?? (me ? [me] : []);
  const categories = categoriesQ.data ?? [];

  const nameOf = (id: number | null) => members.find((m) => m.id === id)?.display_name ?? t("list.unknownMember");
  const category = (id: number) => categories.find((c) => c.id === id);
  const categoryName = (id: number) => category(id)?.name ?? t("list.unknownCategory");
  const payerLabel = (e: Expense) => (e.paid_by === "cash" ? t("list.messCash") : nameOf(e.paid_by_member_id));
  const money = (paisa: number) => formatMoney(paisa, locale, mode);

  const expenses = expensesQ.data ?? [];
  // Approved expenses only: pending/rejected ones don't count towards the month yet.
  const totals: Record<Group, number> = { fixed: 0, meals: 0 };
  for (const e of expenses) {
    const group = category(e.category_id)?.group;
    if (e.status === "approved" && group) totals[group] += e.amount_paisa;
  }

  const pending = pendingQ.data ?? [];
  const showQueue = isStaff && Boolean(mess) && (mess!.approval_required || pending.length > 0);

  const loading = messQ.isPending || membersQ.isPending || monthsQ.isPending || currentQ.isPending || categoriesQ.isPending || (monthId !== null && expensesQ.isPending);
  const loadFailed = messQ.isError || monthsQ.isError || categoriesQ.isError || expensesQ.isError || (currentQ.isError && months.length === 0 && !monthsQ.isPending);
  const monthIndex = months.findIndex((m) => m.id === monthId);
  const olderMonth = monthIndex >= 0 ? months[monthIndex + 1] : undefined;
  const newerMonth = monthIndex > 0 ? months[monthIndex - 1] : undefined;
  const formOpen = adding || editing !== null;
  const closeForm = () => {
    setAdding(false);
    setEditing(null);
    setPrefill(null);
  };
  const activeCategories = categories.filter((c) => !c.archived_at || c.id === categoryFilter);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {me && mess ? (
          <Button
            variant="primary"
            className="min-h-11"
            onPress={() => {
              setSaved(null);
              setNotice(null);
              setPrefill(null);
              setAdding(true);
            }}
          >
            {t("actions.add")}
          </Button>
        ) : null}
      </div>

      <InstallBanner />

      {me && mess ? (
        <QueuedExpenses
          messId={messId}
          memberId={me.id}
          categoryName={categoryName}
          money={money}
          onEdit={(input) => {
            setSaved(null);
            setNotice(null);
            setPrefill(input);
            setAdding(true);
          }}
        />
      ) : null}

      {saved ? <SavedPanel saved={saved} categoryName={categoryName} money={money} onDismiss={() => setSaved(null)} /> : null}

      {me && mess ? (
        <Modal isOpen={formOpen} onOpenChange={(open) => (open ? undefined : closeForm())}>
          <Modal.Backdrop>
            <Modal.Container placement="center" size="md">
              <Modal.Dialog aria-label={editing ? t("form.editTitle") : t("form.createTitle")} className="max-h-[92dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {editing ? (
                  <ExpenseForm
                    key={`edit-${editing.id}`}
                    bare
                    messId={messId}
                    me={me}
                    members={members}
                    categories={categories}
                    expense={editing}
                    onCancel={closeForm}
                    onSaved={(result) => {
                      closeForm();
                      setSaved({ ...result, edited: true });
                    }}
                  />
                ) : (
                  <ExpenseForm
                    key={prefill ? "prefill" : "new"}
                    bare
                    prefill={prefill ?? undefined}
                    messId={messId}
                    me={me}
                    members={members}
                    categories={categories}
                    onCancel={closeForm}
                    onSaved={(result) => {
                      closeForm();
                      setSaved({ ...result, edited: false });
                    }}
                  />
                )}
              </Modal.Dialog>
            </Modal.Container>
          </Modal.Backdrop>
        </Modal>
      ) : null}

      {showQueue ? (
        <ApprovalQueue messId={messId} expenses={pending} categoryName={categoryName} memberName={nameOf} payerLabel={payerLabel} locale={locale} money={money} />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-1" data-testid="month-stepper">
          <Button isIconOnly variant="ghost" aria-label={t("month.prev")} isDisabled={!olderMonth} onPress={() => olderMonth && setPickedMonth(olderMonth.id)} className="size-11">
            <span aria-hidden="true">‹</span>
          </Button>
          <div className="min-w-36 text-center">
            <p className="font-semibold">{month ? formatMonthLabel(month.starts_on, locale) : "…"}</p>
            {month ? <p className="text-sm text-muted">{month.status === "open" ? t("month.open") : t("month.closed")}</p> : null}
          </div>
          <Button isIconOnly variant="ghost" aria-label={t("month.next")} isDisabled={!newerMonth} onPress={() => newerMonth && setPickedMonth(newerMonth.id)} className="size-11">
            <span aria-hidden="true">›</span>
          </Button>
        </div>

        <section aria-labelledby="totals-title" className="flex gap-6">
          <h2 id="totals-title" className="sr-only">
            {t("totals.title")}
          </h2>
          {(["fixed", "meals"] as const).map((g) => (
            <div key={g} data-testid={`total-${g}`}>
              <p className="text-sm text-muted">{t(`groups.${g}`)}</p>
              <p className="text-lg font-semibold tabular-nums">{money(totals[g])}</p>
            </div>
          ))}
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("filters.status")} className="flex flex-wrap gap-2">
          {[null, ...STATUSES].map((s) => (
            <Button key={s ?? "all"} size="sm" variant={status === s ? "primary" : "secondary"} aria-pressed={status === s} className="min-h-9" onPress={() => setStatus(s)}>
              {s === null ? t("filters.all") : t(`status.${s}`)}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Select id="member-filter" label={t("filters.member")} value={String(payer)} onChange={(v) => setMemberFilter(v === "all" || v === "cash" ? v : Number(v))}>
              <option value="all">{t("filters.allMembers")}</option>
              <option value="cash">{t("filters.messCash")}</option>
              {members.map((m: Member) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
          </Select>
          <Select id="category-filter" label={t("filters.category")} value={categoryFilter ?? ""} onChange={(v) => setCategoryFilter(v === "" ? null : Number(v))}>
            <option value="">{t("filters.allCategories")}</option>
            {activeCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="-mt-2 text-sm text-muted">{t("totals.hint")}</p>

      {notice ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
          {notice}
        </div>
      ) : null}

      <section aria-labelledby="list-title" className="flex flex-col gap-4">
        <h2 id="list-title" className="sr-only">
          {t("list.title")}
          {month ? ` — ${formatMonthLabel(month.starts_on, locale)}` : ""}
        </h2>
        {loadFailed ? (
          <p role="alert" className="text-danger">
            {t("errors.loadFailed")}
          </p>
        ) : loading ? (
          <p role="status" className="text-muted">
            {t("loading")}
          </p>
        ) : monthId === null ? (
          <p className="text-muted">{t("errors.noMonth")}</p>
        ) : expenses.length === 0 ? (
          <p className="text-muted">{t("list.empty")}</p>
        ) : (
          byDay(expenses).map(({ day, items }) => (
            <div key={day} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-muted">{formatDate(day, locale)}</h3>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
                {items.map((e) => (
                  <ListItem
                    key={e.id}
                    expense={e}
                    categoryName={categoryName(e.category_id)}
                    payerLabel={payerLabel(e)}
                    locale={locale}
                    money={money}
                    abilities={mess && me ? expenseAbilities(e, months.find((m) => m.id === e.month_id) ?? (currentQ.data?.id === e.month_id ? currentQ.data : undefined), mess as Mess, me) : { canEdit: false, canDelete: false }}
                    onEdit={() => {
                      setNotice(null);
                      setSaved(null);
                      setEditing(e);
                    }}
                    onError={setNotice}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

/** A compact dropdown; the label is for screen readers only so filters fit on one line. */
function Select({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select id={id} className={`${fieldClassInvalid} min-h-9 w-auto py-1 text-sm`} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

function ListItem({
  expense,
  categoryName,
  payerLabel,
  locale,
  money,
  abilities,
  onEdit,
  onError,
}: {
  expense: Expense;
  categoryName: string;
  payerLabel: string;
  locale: AppLocale;
  money: (paisa: number) => string;
  abilities: { canEdit: boolean; canDelete: boolean };
  onEdit: () => void;
  onError: (message: string | null) => void;
}) {
  const t = useTranslations("expenses");
  const { messId } = useMess();
  const del = useDeleteExpense(messId);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    onError(null);
    try {
      await del.mutateAsync(expense.id);
    } catch (error) {
      setConfirming(false);
      if (!isApiError(error)) return onError(t("errors.generic"));
      const key = errorKey(error);
      onError(key === "generic" && error.message ? error.message : t(`errors.${key}`));
    }
  }

  const label = `${categoryName} ${money(expense.amount_paisa)}`;
  const hasActions = abilities.canEdit || abilities.canDelete;
  const menu = hasActions ? (
    <RowMenu
      label={`${t("actions.menu")}: ${label}`}
      actions={[
        ...(abilities.canEdit ? [{ id: "edit", label: t("actions.edit"), ariaLabel: `${t("actions.edit")}: ${label}`, onAction: onEdit }] : []),
        ...(abilities.canDelete ? [{ id: "delete", label: t("actions.delete"), ariaLabel: `${t("actions.delete")}: ${label}`, danger: true, onAction: () => setConfirming(true) }] : []),
      ]}
    />
  ) : null;

  return (
    <ExpenseRow expense={expense} categoryName={categoryName} payerLabel={payerLabel} locale={locale} money={money} menu={menu}>
      {confirming ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm">{t("actions.confirmDelete")}</span>
          <Button size="sm" variant="danger" onPress={remove} isDisabled={del.isPending}>
            {t("actions.confirmYes")}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => setConfirming(false)}>
            {t("actions.cancel")}
          </Button>
        </div>
      ) : null}
    </ExpenseRow>
  );
}
