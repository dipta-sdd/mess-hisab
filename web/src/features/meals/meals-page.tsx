"use client";

import { Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { MealEntry, Member } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { formatDate, formatMeals, formatNumber } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import {
  useBulkSaveMeals,
  useCurrentMonth,
  useMeals,
  useMembers,
  useMessInfo,
  useMonths,
  useSaveMeal,
} from "./api";
import { dayLabel, daysBetween, memberInMess } from "./dates";
import { formatMonthLabel, todayInDhaka } from "@/lib/format/date";
import { buildPayload, cellKey, parseKey, type CellDraft, type Drafts } from "./draft";
import { MealCell } from "./meal-cell";
import { fieldClassInvalid } from "@/components/ui/field";

type View = "grid" | "day";

/** True on a phone-sized screen; false where matchMedia is missing (tests, SSR). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function MealsPage() {
  const { messId } = useMess();
  const t = useTranslations("meals");
  const locale = useLocale() as AppLocale;

  const messQ = useMessInfo(messId);
  const membersQ = useMembers(messId);
  const monthsQ = useMonths(messId);
  const currentQ = useCurrentMonth(messId);

  const [pickedMonth, setPickedMonth] = useState<number | null>(null);
  const [pickedView, setPickedView] = useState<View | null>(null);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const [problems, setProblems] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const narrow = useNarrow();

  const months = monthsQ.data ?? [];
  const monthId = pickedMonth ?? currentQ.data?.id ?? (currentQ.isError ? (months[0]?.id ?? null) : null);
  const month = months.find((m) => m.id === monthId) ?? (currentQ.data?.id === monthId ? currentQ.data : undefined);
  const mealsQ = useMeals(messId, monthId);

  const bulk = useBulkSaveMeals(messId);
  const single = useSaveMeal(messId);

  const mess = messQ.data?.mess;
  const me = messQ.data?.me;
  const isManager = Boolean(me?.is_manager);
  const style = mess?.meal_tracking ?? "daily_number";
  const closed = month?.status === "closed";

  const members = useMemo(() => {
    if (!month) return [] as Member[];
    return (membersQ.data ?? []).filter((m) => m.joined_on <= month.ends_on && (m.left_on === null || m.left_on >= month.starts_on));
  }, [membersQ.data, month]);

  const days = useMemo(() => (month ? daysBetween(month.starts_on, month.ends_on) : []), [month]);
  const entryMap = useMemo(() => {
    const map = new Map<string, MealEntry>();
    for (const e of mealsQ.data?.entries ?? []) map.set(cellKey(e.member_id, e.entry_date), e);
    return map;
  }, [mealsQ.data]);

  const today = todayInDhaka();
  const day = pickedDay && days.includes(pickedDay) ? pickedDay : days.includes(today) ? today : (days[0] ?? "");
  const view: View = pickedView ?? (narrow ? "day" : "grid");

  const canWriteFor = (memberId: number) =>
    !closed && style !== "off" && (isManager || (mess?.meal_entry_by === "self" && memberId === me?.id));
  const monthTotalDate = month?.starts_on ?? "";
  const editableCell = (member: Member, date: string) => {
    if (!canWriteFor(member.id)) return false;
    return style === "month_total" ? true : memberInMess(member.joined_on, member.left_on, date);
  };
  const anyEditable = members.some((m) => canWriteFor(m.id));
  const dirty = Object.keys(drafts).length > 0;

  function change(key: string, patch: CellDraft) {
    setSaved(false);
    setProblems([]);
    setDrafts((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function describe(key: string): string {
    const { memberId, date } = parseKey(key);
    const name = members.find((m) => m.id === memberId)?.display_name ?? t("unknownMember");
    return style === "month_total" ? name : `${name}, ${formatDate(date, locale)}`;
  }

  async function save() {
    if (style === "off") return;
    setSaved(false);
    const built = buildPayload(style, drafts);
    if (built.invalid.length > 0) {
      setProblems([t("errors.fixCells", { cells: built.invalid.map(describe).join("; ") })]);
      return;
    }
    if (built.entries.length === 0) return;
    setProblems([]);
    try {
      if (isManager) await bulk.mutateAsync(built.entries);
      else for (const entry of built.entries) await single.mutateAsync(entry);
      setDrafts({});
      setSaved(true);
    } catch (error) {
      setProblems(explain(error, built.keys));
    }
  }

  function explain(error: unknown, keys: string[]): string[] {
    if (!isApiError(error)) return [t("errors.generic")];
    if (error.isConflict && error.code === "meal_tracking_off") return [t("errors.trackingOff")];
    if (error.isConflict && error.code === "month_closed") return [t("errors.monthClosed")];
    if (error.isForbidden) return [t("errors.forbidden")];
    if (error.isValidation) {
      const lines: string[] = [];
      for (const [field, messages] of Object.entries(error.fieldErrors)) {
        const match = /^entries\.(\d+)\./.exec(field);
        const index = match ? Number(match[1]) : 0;
        const who = keys[index] ? describe(keys[index]) : null;
        lines.push(who ? `${who}: ${messages[0]}` : messages[0]);
      }
      return lines.length > 0 ? lines : [error.message];
    }
    return [error.message || t("errors.generic")];
  }

  const loading = messQ.isPending || membersQ.isPending || monthsQ.isPending || currentQ.isPending || (monthId !== null && mealsQ.isPending);
  const loadFailed = messQ.isError || membersQ.isError || monthsQ.isError || mealsQ.isError || (currentQ.isError && months.length === 0 && !monthsQ.isPending);
  const saving = bulk.isPending || single.isPending;
  const totals = mealsQ.data?.totals ?? {};

  const monthPicker = (
    <div className="flex flex-col gap-1">
      <label htmlFor="meals-month" className="text-sm font-medium">{t("month.label")}</label>
      <select
        id="meals-month"
        className={fieldClassInvalid}
        value={monthId ?? ""}
        disabled={months.length === 0}
        onChange={(e) => {
          setPickedMonth(Number(e.target.value));
          setPickedDay(null);
          setDrafts({});
          setProblems([]);
          setSaved(false);
        }}
      >
        {months.map((m) => (
          <option key={m.id} value={m.id}>
            {formatMonthLabel(m.starts_on, locale)} ({m.status === "open" ? t("month.open") : t("month.closed")})
          </option>
        ))}
      </select>
    </div>
  );

  const showOff = !loading && !loadFailed && (style === "off" || mealsQ.data?.style === "off");

  const rowTotal = (m: Member) => {
    const row = totals[String(m.id)];
    return row ? (
      <span data-testid={`total-${m.id}`}>
        {formatMeals(row.meals_centi, locale)}
        {row.guest_meals_centi > 0 ? <span className="text-xs text-muted"> {t("cell.guestsShort", { count: formatMeals(row.guest_meals_centi, locale) })}</span> : null}
      </span>
    ) : (
      <span data-testid={`total-${m.id}`}>{formatNumber(0, locale)}</span>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-24 md:pb-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {monthPicker}
        {!showOff && style !== "month_total" ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium" id="meals-view-label">{t("view.label")}</span>
            <div role="group" aria-labelledby="meals-view-label" className="flex gap-2">
              <Button variant={view === "day" ? "primary" : "secondary"} onPress={() => setPickedView("day")} aria-pressed={view === "day"}>
                {t("view.day")}
              </Button>
              <Button variant={view === "grid" ? "primary" : "secondary"} onPress={() => setPickedView("grid")} aria-pressed={view === "grid"}>
                {t("view.grid")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {closed ? (
        <p role="status" className="rounded-lg border border-default-300 bg-surface p-3 text-sm" data-testid="closed-note">
          {t("closedNote")}
        </p>
      ) : !loading && !showOff && !anyEditable ? (
        <p role="status" className="rounded-lg border border-default-300 bg-surface p-3 text-sm" data-testid="readonly-note">
          {mess?.meal_entry_by === "self" ? t("readOnlySelf") : t("readOnlyManager")}
        </p>
      ) : !loading && !showOff && !isManager ? (
        <p role="status" className="text-sm text-muted">{t("ownRowOnly")}</p>
      ) : null}

      {problems.length > 0 ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger/10 p-3 text-sm text-danger">
          <ul className="list-disc ps-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      ) : null}
      {saved ? <p role="status" className="text-sm text-success">{t("saved")}</p> : null}

      {loadFailed ? (
        <p role="alert" className="text-danger">{t("errors.loadFailed")}</p>
      ) : loading ? (
        <p role="status" className="text-muted">{t("loading")}</p>
      ) : monthId === null ? (
        <p className="text-muted">{t("errors.noMonth")}</p>
      ) : showOff ? (
        <section className="rounded-2xl border border-default-200 bg-surface p-6 text-center" data-testid="tracking-off">
          <h2 className="text-lg font-semibold">{t("off.title")}</h2>
          <p className="mt-1 text-muted">{t("off.body")}</p>
        </section>
      ) : style === "off" ? null : style === "month_total" ? (
        <ul className="flex flex-col gap-2" aria-label={t("title")}>
          {members.map((m) => {
            const key = cellKey(m.id, monthTotalDate);
            return (
              <li key={m.id} className="rounded-xl border border-default-200 bg-surface p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 break-words font-medium">{m.display_name}</p>
                  <p className="shrink-0 text-sm text-muted">{t("totalLabel")}: {rowTotal(m)}</p>
                </div>
                <div className="mt-2 max-w-40">
                  <MealCell
                    style={style}
                    label={m.display_name}
                    entry={entryMap.get(key)}
                    draft={drafts[key]}
                    editable={editableCell(m, monthTotalDate)}
                    onChange={(patch) => change(key, patch)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : view === "day" ? (
        <section aria-label={t("view.day")} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Button variant="secondary" isDisabled={days.indexOf(day) <= 0} onPress={() => setPickedDay(days[days.indexOf(day) - 1])} aria-label={t("day.prev")}>
              ‹
            </Button>
            <div className="flex min-w-0 flex-1 flex-col items-center">
              <label htmlFor="meals-day" className="sr-only">{t("day.pick")}</label>
              <select id="meals-day" className={`${fieldClassInvalid} text-center`} value={day} onChange={(e) => setPickedDay(e.target.value)}>
                {days.map((d) => <option key={d} value={d}>{formatDate(d, locale)}</option>)}
              </select>
            </div>
            <Button variant="secondary" isDisabled={days.indexOf(day) >= days.length - 1} onPress={() => setPickedDay(days[days.indexOf(day) + 1])} aria-label={t("day.next")}>
              ›
            </Button>
          </div>
          <ul className="flex flex-col gap-2">
            {members.map((m) => {
              const key = cellKey(m.id, day);
              const label = `${m.display_name}, ${formatDate(day, locale)}`;
              return (
                <li key={m.id} className="rounded-xl border border-default-200 bg-surface p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 break-words font-medium">{m.display_name}</p>
                    <p className="shrink-0 text-xs text-muted">{t("totalLabel")}: {rowTotal(m)}</p>
                  </div>
                  <div className="mt-2 max-w-48">
                    <MealCell
                      style={style}
                      label={label}
                      entry={entryMap.get(key)}
                      draft={drafts[key]}
                      editable={editableCell(m, day)}
                      onChange={(patch) => change(key, patch)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-default-200 bg-surface">
          <table className="min-w-full border-collapse text-sm">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky start-0 z-10 min-w-24 max-w-32 border-e border-default-200 bg-surface p-2 text-start">{t("member")}</th>
                {days.map((d) => (
                  <th key={d} scope="col" className="min-w-24 p-2 text-center font-medium">{dayLabel(d, locale)}</th>
                ))}
                <th scope="col" className="sticky end-0 z-10 border-s border-default-200 bg-surface p-2 text-center">{t("totalLabel")}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-default-200">
                  <th scope="row" className="sticky start-0 z-10 min-w-24 max-w-32 break-words border-e border-default-200 bg-surface p-2 text-start font-medium">{m.display_name}</th>
                  {days.map((d) => {
                    const key = cellKey(m.id, d);
                    const ok = editableCell(m, d);
                    return (
                      <td key={d} className="p-1 align-top">
                        {memberInMess(m.joined_on, m.left_on, d) ? (
                          <MealCell
                            style={style}
                            label={`${m.display_name}, ${formatDate(d, locale)}`}
                            entry={entryMap.get(key)}
                            draft={drafts[key]}
                            editable={ok}
                            compact
                            onChange={(patch) => change(key, patch)}
                          />
                        ) : (
                          <span className="block text-center text-muted">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="sticky end-0 z-10 border-s border-default-200 bg-surface p-2 text-center font-semibold tabular-nums">{rowTotal(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {anyEditable && !showOff && !loading ? (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 border-t border-default-200 bg-background p-3 md:static md:z-auto md:border-0 md:p-0">
          <p className="min-w-0 text-sm text-muted">{dirty ? t("unsaved", { count: formatNumber(Object.keys(drafts).length, locale) }) : t("noChanges")}</p>
          <div className="flex shrink-0 gap-2">
            {dirty ? (
              <Button variant="ghost" onPress={() => { setDrafts({}); setProblems([]); }} isDisabled={saving}>
                {t("actions.discard")}
              </Button>
            ) : null}
            <Button variant="primary" onPress={save} isDisabled={!dirty || saving}>
              {saving ? t("actions.saving") : t("actions.save")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
