"use client";

import { Button, Spinner } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { AppLocale } from "@/i18n/config";
import type { AuditLog } from "@/lib/api/contract";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useMess } from "@/lib/mess/mess-context";
import { useAuditLog, useAuditMembers, type AuditFilters } from "./api";
import { diffRows, EVENT_GROUPS, isMoneyKey } from "./diff";

const FIELD = "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function readFilters(params: URLSearchParams): AuditFilters {
  const page = Number(params.get("page"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return {
    event: params.get("event") ?? "",
    member_id: params.get("member_id") ?? "",
    from: ISO_DATE.test(from) ? from : "",
    to: ISO_DATE.test(to) ? to : "",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Filter state lives in the URL query so a filtered view can be shared and survives reload. */
function useUrlFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = readFilters(new URLSearchParams(params?.toString() ?? ""));

  const update = (patch: Partial<AuditFilters>) => {
    const next = { ...filters, ...patch };
    if (!("page" in patch)) next.page = 1; // any filter change goes back to page 1
    const qs = new URLSearchParams();
    if (next.event) qs.set("event", next.event);
    if (next.member_id) qs.set("member_id", next.member_id);
    if (next.from) qs.set("from", next.from);
    if (next.to) qs.set("to", next.to);
    if (next.page > 1) qs.set("page", String(next.page));
    const text = qs.toString();
    router.replace(text ? `${pathname}?${text}` : pathname);
  };
  return { filters, update };
}

function relativeTime(iso: string, locale: AppLocale, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD-u-nu-beng" : "en", { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(seconds, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return "";
}

function timeOfDay(iso: string, locale: AppLocale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD-u-nu-beng" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  }).format(d);
}

export function AuditPage() {
  const t = useTranslations("audit");
  const { messId } = useMess();
  const { filters, update } = useUrlFilters();
  const members = useAuditMembers(messId);
  const rangeInvalid = Boolean(filters.from && filters.to && filters.to < filters.from);
  const log = useAuditLog(messId, filters, !rangeInvalid);

  const nameOf = (id: number | null) =>
    id === null ? t("system") : (members.data?.find((m) => m.id === id)?.display_name ?? t("unknownMember"));
  const meta = log.data?.meta;
  const entries = log.data?.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <form role="search" aria-label={t("filters.title")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("filters.event")}
          <select className={FIELD} value={filters.event} onChange={(e) => update({ event: e.target.value })}>
            <option value="">{t("filters.allEvents")}</option>
            {EVENT_GROUPS.map((g) => (
              <option key={g} value={g}>
                {t(`groups.${g.slice(0, -1)}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("filters.member")}
          <select className={FIELD} value={filters.member_id} onChange={(e) => update({ member_id: e.target.value })}>
            <option value="">{t("filters.allMembers")}</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("filters.from")}
          <input className={FIELD} type="date" value={filters.from} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("filters.to")}
          <input className={FIELD} type="date" value={filters.to} onChange={(e) => update({ to: e.target.value })} />
        </label>
      </form>
      {rangeInvalid ? <p role="alert" className="text-sm text-danger">{t("filters.rangeInvalid")}</p> : null}

      {log.isPending && !rangeInvalid ? (
        <div className="flex justify-center py-10" role="status" aria-label={t("loading")}>
          <Spinner />
        </div>
      ) : log.isError ? (
        <p role="alert" className="rounded-xl border border-danger p-3 text-danger">{t("loadFailed")}</p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-muted">{t("empty")}</p>
      ) : (
        <>
          <div className="hidden grid-cols-[11rem_1fr_10rem] gap-3 px-3 text-xs font-medium uppercase text-muted md:grid" aria-hidden="true">
            <span>{t("columns.when")}</span>
            <span>{t("columns.what")}</span>
            <span>{t("columns.who")}</span>
          </div>
          <ul className="flex flex-col gap-2" aria-label={t("title")}>
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} who={nameOf(entry.member_id)} />
            ))}
          </ul>
          {meta ? (
            <nav className="flex flex-wrap items-center justify-between gap-2" aria-label={t("pagination.label")}>
              <Button variant="outline" size="sm" isDisabled={meta.current_page <= 1} onPress={() => update({ page: meta.current_page - 1 })}>
                {t("pagination.previous")}
              </Button>
              <span className="text-sm" aria-live="polite">
                <PageStatus current={meta.current_page} last={meta.last_page} total={meta.total} />
              </span>
              <Button variant="outline" size="sm" isDisabled={meta.current_page >= meta.last_page} onPress={() => update({ page: meta.current_page + 1 })}>
                {t("pagination.next")}
              </Button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function PageStatus({ current, last, total }: { current: number; last: number; total: number }) {
  const t = useTranslations("audit");
  const locale = useLocale() as AppLocale;
  return <>{t("pagination.status", { page: formatNumber(current, locale), pages: formatNumber(Math.max(last, 1), locale), total: formatNumber(total, locale) })}</>;
}

/** Human summary of an event: known events first, then `<model>.<action>`, then the raw name. */
function useEventSummary() {
  const t = useTranslations("audit");
  return (event: string): string => {
    if (t.has(`events.${event}`)) return t(`events.${event}`);
    const match = /^([a-z0-9_]+)\.(created|updated|deleted)$/.exec(event);
    if (match) {
      const [, model, action] = match;
      const label = t.has(`models.${model}`) ? t(`models.${model}`) : model.replace(/_/g, " ");
      return t(`generic.${action}`, { model: label });
    }
    return event;
  };
}

function AuditRow({ entry, who }: { entry: AuditLog; who: string }) {
  const t = useTranslations("audit");
  const locale = useLocale() as AppLocale;
  const summary = useEventSummary()(entry.event);
  const [open, setOpen] = useState(false);
  const rows = diffRows(entry.before ?? {}, entry.after ?? {});
  const relative = relativeTime(entry.created_at, locale);

  const value = (key: string, v: unknown): string => {
    if (v === null || v === undefined) return t("diff.empty");
    if (isMoneyKey(key) && typeof v === "number") return formatMoney(v, locale);
    if (typeof v === "boolean") return v ? t("diff.yes") : t("diff.no");
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border p-3 md:grid md:grid-cols-[11rem_1fr_10rem] md:items-start md:gap-3">
      <div className="text-sm text-muted">
        <time dateTime={entry.created_at} title={entry.created_at}>
          {formatDate(entry.created_at, locale)} {timeOfDay(entry.created_at, locale)}
        </time>
        {relative ? <span className="block text-xs">{relative}</span> : null}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="font-medium">{summary}</p>
        {summary !== entry.event ? <p className="text-xs text-muted">{entry.event}</p> : null}
        {rows.length > 0 ? (
          <>
            <button
              type="button"
              className="min-h-11 self-start text-sm text-accent underline"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? t("diff.hide") : t("diff.show", { count: formatNumber(rows.length, locale) })}
            </button>
            {open ? (
              <dl className="flex flex-col gap-1 rounded-lg bg-surface p-2 text-sm">
                {rows.map((r) => (
                  <div key={r.key} className="flex flex-wrap gap-x-2" data-testid={`diff-${r.key}`}>
                    <dt className="font-medium">{r.key}</dt>
                    <dd>
                      <span className="text-muted">{r.hasBefore ? value(r.key, r.before) : t("diff.empty")}</span>
                      <span aria-label={t("diff.to")}> → </span>
                      <span>{r.hasAfter ? value(r.key, r.after) : t("diff.empty")}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        ) : null}
      </div>
      <p className="text-sm">
        <span className="text-muted md:hidden">{t("columns.who")}: </span>
        {who}
      </p>
    </li>
  );
}
