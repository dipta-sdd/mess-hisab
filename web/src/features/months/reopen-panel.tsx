"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Month } from "@/lib/api/contract";
import { useReopenMonth, useReopenPreview } from "./api";
import { ReopenBlocks, type BlockContext } from "./blocks";
import { Banner, useErrorText } from "./ui";

/** Manager-only reopen flow for the latest closed month: preview, explain blocks, confirm. */
export function ReopenPanel({ messId, month, ctx, onReopened }: { messId: number; month: Month; ctx: BlockContext; onReopened: () => void }) {
  const t = useTranslations("months.reopen");
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useReopenPreview(messId, month.id, open);
  const reopen = useReopenMonth(messId, month.id);
  const data = preview.data;

  async function doReopen() {
    setError(null);
    try {
      await reopen.mutateAsync();
      onReopened();
    } catch (e) {
      setConfirming(false);
      setError(errorText(e));
    }
  }

  return (
    <section aria-labelledby="reopen-title" className="flex flex-col gap-3 rounded-2xl border border-default-200 bg-surface p-4">
      <h3 id="reopen-title" className="text-lg font-semibold">{t("title")}</h3>
      <p className="text-sm text-muted">{t("intro")}</p>

      {!open ? (
        <div>
          <Button variant="secondary" onPress={() => setOpen(true)}>{t("review")}</Button>
        </div>
      ) : null}

      {error ? <Banner>{error}</Banner> : null}
      {open && preview.isPending ? <p role="status" className="text-sm text-muted">{t("loading")}</p> : null}
      {preview.isError ? <Banner>{errorText(preview.error)}</Banner> : null}

      {data ? (
        <>
          {data.blocks.length > 0 ? <ReopenBlocks blocks={data.blocks} ctx={ctx} /> : null}

          <div className="max-h-[60vh] overflow-auto rounded-lg border border-default-200">
            <table className="w-full text-sm tabular-nums">
              <caption className="p-2 text-start font-medium">{t("table.caption")}</caption>
              <thead>
                <tr className="text-start text-muted">
                  <th scope="col" className="sticky start-0 top-0 z-20 min-w-28 bg-surface p-2 text-start font-medium">{t("table.member")}</th>
                  <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-surface p-2 text-end font-medium">{t("table.before")}</th>
                  <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-surface p-2 text-end font-medium">{t("table.after")}</th>
                  <th scope="col" className="sticky top-0 z-10 whitespace-nowrap bg-surface p-2 text-end font-medium">{t("table.change")}</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.member_id} className="border-t border-default-200">
                    <th scope="row" className="sticky start-0 z-10 min-w-28 max-w-40 break-words bg-surface p-2 text-start font-normal">{m.display_name}</th>
                    <td className="whitespace-nowrap p-2 text-end">{ctx.money(m.before_paisa)}</td>
                    <td className="whitespace-nowrap p-2 text-end">{ctx.money(m.after_paisa)}</td>
                    <td className="whitespace-nowrap p-2 text-end">{ctx.money(m.change_paisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="list-disc ps-5 text-sm">
            <li data-testid="rows-to-delete">{t("rowsToDelete", { count: data.rows_to_delete })}</li>
            <li data-testid="next-month-note">
              {data.next_month === null
                ? t("nextMonth.none")
                : data.next_month.will_be_deleted
                  ? t("nextMonth.deleted")
                  : t("nextMonth.kept")}
            </li>
          </ul>

          {data.can_reopen && !confirming ? (
            <div>
              <Button variant="primary" onPress={() => setConfirming(true)}>{t("action")}</Button>
            </div>
          ) : null}
          {!data.can_reopen ? <p className="text-sm text-muted">{t("cannot")}</p> : null}

          {confirming ? (
            <div role="group" aria-label={t("confirmTitle")} className="flex flex-col gap-2 rounded-xl border border-danger p-3">
              <p className="font-medium">{t("confirmTitle")}</p>
              <p className="text-sm">{t("confirmBody")}</p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="ghost" className="w-full sm:w-auto" onPress={() => setConfirming(false)}>{t("cancel")}</Button>
                <Button variant="danger" className="w-full sm:w-auto" onPress={doReopen} isDisabled={reopen.isPending}>
                  {reopen.isPending ? t("reopening") : t("confirmYes")}
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
