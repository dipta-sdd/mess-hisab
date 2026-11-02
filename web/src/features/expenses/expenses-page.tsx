"use client";

import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { Expense, ExpenseStatus, Group, Member, Mess, Month } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useCategories, useCurrentMonth, useDeleteExpense, useExpenses, useMembers, useMessInfo, useMonths, usePendingExpenses, type CreateResult } from "./api";
import { ApprovalQueue } from "./approval-queue";
import { formatMonthLabel } from "@/lib/format/date";
import { ExpenseForm } from "./expense-form";
import { ExpenseRow } from "./expense-row";
import { SavedPanel } from "./quick-add/saved-panel";
import { errorKey, expenseAbilities } from "./rules";
import { fieldClassInvalid } from "@/components/ui/field";

const STATUSES: ExpenseStatus[] = ["pending", "approved", "rejected"];

export function ExpensesPage() {
  const { messId } = useMess();
  const t = useTranslations("expenses");
  const locale = useLocale() as AppLocale;

  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const monthsQ = useMonths(messId);
  const currentQ = useCurrentMonth(messId);
  const categoriesQ = useCategories(messId);

  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const [status, setStatus] = useState<ExpenseStatus | null>(null);
  const [memberFilter, setMemberFilter] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [saved, setSaved] = useState<(CreateResult & { edited: boolean }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const months = monthsQ.data ?? [];
  const monthId = pickedMonth ?? currentQ.data?.id ?? (currentQ.isError ? (months[0]?.id ?? null) : null);
  const month = months.find((m) => m.id === monthId) ?? (currentQ.data?.id === monthId ? currentQ.data : undefined);
  const expensesQ = useExpenses(messId, { monthId, status, memberId: memberFilter, categoryId: categoryFilter });

  const mess = messQ.data?.mess;
  const me = messQ.data?.me;
  const isManager = Boolean(me?.is_manager);
  const isStaff = isManager || Boolean(me?.is_admin);
  const pendingQ = usePendingExpenses(messId, isManager);
  const mode = mess?.rounding_mode ?? "two_decimals";
  const members = membersQ.data ?? [];
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
  const showQueue = isManager && Boolean(mess) && (mess!.approval_required || pending.length > 0);

  const loading = messQ.isPending || monthsQ.isPending || currentQ.isPending || categoriesQ.isPending || (monthId !== null && expensesQ.isPending);
  const loadFailed = messQ.isError || monthsQ.isError || categoriesQ.isError || expensesQ.isError || (currentQ.isError && months.length === 0 && !monthsQ.isPending);
  const activeCategories = categories.filter((c) => !c.archived_at || c.id === categoryFilter);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {saved ? <SavedPanel saved={saved} categoryName={categoryName} money={money} onDismiss={() => setSaved(null)} /> : null}

      {me && mess ? (
        editing ? (
          <ExpenseForm
            key={`edit-${editing.id}`}
            messId={messId}
            me={me}
            members={members}
            categories={categories}
            expense={editing}
            onCancel={() => setEditing(null)}
            onSaved={(result) => {
              setEditing(null);
              setSaved({ ...result, edited: true });
            }}
          />
        ) : (
          <ExpenseForm key="new" messId={messId} me={me} members={members} categories={categories} onSaved={(result) => setSaved({ ...result, edited: false })} />
        )
      ) : null}

      {showQueue ? (
        <ApprovalQueue messId={messId} expenses={pending} categoryName={categoryName} memberName={nameOf} payerLabel={payerLabel} locale={locale} money={money} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Select id="month-picker" label={t("filters.month")} value={monthId ?? ""} disabled={months.length === 0} onChange={(v) => setPickedMonth(Number(v))}>
          {months.map((m: Month) => (
            <option key={m.id} value={m.id}>
              {formatMonthLabel(m.starts_on, locale)} ({m.status === "open" ? t("month.open") : t("month.closed")})
            </option>
          ))}
        </Select>
        <Select id="status-filter" label={t("filters.status")} value={status ?? ""} onChange={(v) => setStatus(v === "" ? null : (v as ExpenseStatus))}>
          <option value="">{t("filters.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        {isStaff ? (
          <Select id="member-filter" label={t("filters.member")} value={memberFilter ?? ""} onChange={(v) => setMemberFilter(v === "" ? null : Number(v))}>
            <option value="">{t("filters.allMembers")}</option>
            {members.map((m: Member) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select id="category-filter" label={t("filters.category")} value={categoryFilter ?? ""} onChange={(v) => setCategoryFilter(v === "" ? null : Number(v))}>
          <option value="">{t("filters.allCategories")}</option>
          {activeCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <section aria-labelledby="totals-title" className="grid grid-cols-2 gap-3">
        <h2 id="totals-title" className="sr-only">
          {t("totals.title")}
        </h2>
        {(["fixed", "meals"] as const).map((g) => (
          <div key={g} className="rounded-xl border border-border bg-surface p-3" data-testid={`total-${g}`}>
            <p className="text-sm text-muted">{t(`groups.${g}`)}</p>
            <p className="text-lg font-semibold">{money(totals[g])}</p>
          </div>
        ))}
        <p className="col-span-2 text-xs text-muted">{t("totals.hint")}</p>
      </section>

      {notice ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
          {notice}
        </div>
      ) : null}

      <section aria-labelledby="list-title" className="flex flex-col gap-2">
        <h2 id="list-title" className="text-lg font-semibold">
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
          <ul className="flex flex-col gap-2">
            {expenses.map((e) => (
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
        )}
      </section>
    </div>
  );
}

function Select({
  id,
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string | number;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} className={fieldClassInvalid} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
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
  return (
    <ExpenseRow expense={expense} categoryName={categoryName} payerLabel={payerLabel} locale={locale} money={money}>
      {abilities.canEdit || abilities.canDelete ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {confirming ? (
            <>
              <span className="text-sm">{t("actions.confirmDelete")}</span>
              <Button size="sm" variant="danger" onPress={remove} isDisabled={del.isPending}>
                {t("actions.confirmYes")}
              </Button>
              <Button size="sm" variant="ghost" onPress={() => setConfirming(false)}>
                {t("actions.cancel")}
              </Button>
            </>
          ) : (
            <>
              {abilities.canEdit ? (
                <Button size="sm" variant="secondary" onPress={onEdit} aria-label={`${t("actions.edit")}: ${label}`}>
                  {t("actions.edit")}
                </Button>
              ) : null}
              {abilities.canDelete ? (
                <Button size="sm" variant="danger-soft" onPress={() => setConfirming(true)} aria-label={`${t("actions.delete")}: ${label}`}>
                  {t("actions.delete")}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </ExpenseRow>
  );
}
