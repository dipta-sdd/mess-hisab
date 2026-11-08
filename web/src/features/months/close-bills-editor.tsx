"use client";

import { Accordion, Button } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { fieldClassInvalid } from "@/components/ui/field";
import { AddBillForm } from "@/features/fixed/add-bill-form";
import type { AppLocale } from "@/i18n/config";
import type { Bill, ClosePreview, Member } from "@/lib/api/contract";
import { formatNumber } from "@/lib/format";
import { CloseBlocks, type BlockContext } from "./blocks";
import { type BillDraft, type BillDrafts, draftOf } from "./close-bills";

interface Row { key: string; id: number | null; name: string; subtitle: string; draft: BillDraft; changed: boolean; isNew: boolean; newKey?: string }

/** The popup body: fixed bills with typed-in changes (nothing is saved here) and a live preview of the result. */
export function CloseBillsEditor({
  bills,
  names,
  members,
  drafts,
  setDrafts,
  preview,
  previewing,
  invalid,
  ctx,
  onDone,
  onDiscard,
}: {
  bills: Bill[];
  names: Record<number, string>;
  members: Member[];
  drafts: BillDrafts;
  setDrafts: (next: BillDrafts) => void;
  preview: ClosePreview | undefined;
  previewing: boolean;
  invalid: boolean;
  ctx: BlockContext;
  onDone: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations("months.close.edit");
  const tf = useTranslations("fixed");
  const locale = useLocale() as AppLocale;
  const [adding, setAdding] = useState(false);

  const rows: Row[] = [
    ...bills.filter((b) => b.group === "fixed").map((b): Row => {
      const original = draftOf(b);
      const draft = drafts.existing[b.category_id] ?? original;
      const changed = draft.amount !== original.amount || members.some((m) => (draft.overrides[m.id] ?? "") !== (original.overrides[m.id] ?? ""));
      return { key: `c${b.category_id}`, id: b.category_id, name: names[b.category_id] ?? tf("bill.unknownCategory"), subtitle: tf(`split.${b.split_type}`), draft, changed, isNew: false };
    }),
    ...drafts.created.map((b): Row => ({ key: b.key, id: null, name: b.name, subtitle: tf(`split.${b.split_type}`), draft: b, changed: true, isNew: true, newKey: b.key })),
  ];

  function update(row: Row, next: BillDraft) {
    if (row.isNew) setDrafts({ ...drafts, created: drafts.created.map((b) => (b.key === row.newKey ? { ...b, ...next } : b)) });
    else if (row.id !== null) setDrafts({ ...drafts, existing: { ...drafts.existing, [row.id]: next } });
  }

  if (adding) {
    return (
      <AddBillForm
        onCancel={() => setAdding(false)}
        onSubmit={(name, split_type) => {
          setDrafts({ ...drafts, created: [...drafts.created, { key: `new-${Date.now()}`, name, split_type, amount: "", overrides: {} }] });
          setAdding(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted">{t("hint")}</p>
      </div>

      <Accordion allowsMultipleExpanded className="overflow-hidden rounded-2xl border border-border bg-surface">
        {rows.map((row) => {
          const idBase = `cb-${row.key}`;
          const label = row.subtitle === tf("split.fixed_per_person") ? t("share") : tf("bill.override");
          return (
            <Accordion.Item key={row.key} id={row.key} aria-label={row.name} data-testid={`close-bill-${row.key}`}>
              <Accordion.Heading>
                <Accordion.Trigger className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-start">
                  <span className="min-w-0">
                    <span className="block break-words font-medium">{row.name}</span>
                    <span className="block text-sm text-muted">
                      {row.subtitle}
                      {row.isNew ? <span className="font-medium text-accent"> · {t("newBadge")}</span> : row.changed ? <span className="font-medium text-warning"> · {t("note")}</span> : null}
                    </span>
                  </span>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="flex flex-col gap-3 px-4 pb-4">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`${idBase}-amount`} className="text-sm font-medium">{t("amount")}</label>
                    <input
                      id={`${idBase}-amount`}
                      className={`${fieldClassInvalid} max-w-60`}
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={formatNumber(0, locale)}
                      value={row.draft.amount}
                      onChange={(e) => update(row, { ...row.draft, amount: e.target.value })}
                    />
                  </div>
                  <ul className="flex flex-col divide-y divide-border" aria-label={tf("bill.shares")}>
                    {members.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span className="min-w-0 break-words font-medium">{m.display_name}</span>
                        <span>
                          <label htmlFor={`${idBase}-m${m.id}`} className="sr-only">{`${label}: ${m.display_name}`}</label>
                          <input
                            id={`${idBase}-m${m.id}`}
                            className={`${fieldClassInvalid} w-28 text-end`}
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder={t("auto")}
                            value={row.draft.overrides[m.id] ?? ""}
                            onChange={(e) => update(row, { ...row.draft, overrides: { ...row.draft.overrides, [m.id]: e.target.value } })}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                  {row.isNew ? (
                    <div>
                      <Button size="sm" variant="ghost" onPress={() => setDrafts({ ...drafts, created: drafts.created.filter((b) => b.key !== row.newKey) })}>{t("remove")}</Button>
                    </div>
                  ) : null}
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>

      <div>
        <Button variant="secondary" className="min-h-11" onPress={() => setAdding(true)}>{t("addNew")}</Button>
      </div>

      {invalid ? <p role="alert" className="rounded-lg border border-danger bg-danger/10 p-2 text-sm text-danger">{t("badAmount")}</p> : null}

      <section aria-labelledby="cb-preview" className="flex flex-col gap-2">
        <div>
          <h3 id="cb-preview" className="font-semibold">{t("preview")}</h3>
          <p className="text-sm text-muted">{t("previewHint")}</p>
        </div>
        {previewing ? <p role="status" className="text-sm text-muted">{t("previewLoading")}</p> : null}
        {preview && preview.blocks.length > 0 ? <CloseBlocks blocks={preview.blocks} ctx={ctx} /> : null}
        {preview ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border" data-testid="close-preview-balances">
            {preview.balances.map((b) => (
              <li key={b.member_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 break-words">{ctx.nameOf(b.member_id)}</span>
                <span className="font-semibold tabular-nums">{ctx.balance(b.balance_paisa)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="w-full sm:w-auto" onPress={onDiscard}>{t("discard")}</Button>
        <Button variant="primary" className="w-full sm:w-auto" onPress={onDone}>{t("done")}</Button>
      </div>
    </div>
  );
}
