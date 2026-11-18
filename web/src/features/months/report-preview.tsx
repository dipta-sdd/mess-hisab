"use client";

import { Button, Modal } from "@heroui/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { ReportBody } from "@/features/reports/report-page";
import { downloadPreviewPdf, usePreviewNextBills, usePreviewReport, type PreviewAnswers } from "@/features/reports/api";
import type { MonthlyReport } from "@/features/reports/types";
import type { AppLocale } from "@/i18n/config";
import type { CloseBillEdit, Member, Month, ZeroMealResolution } from "@/lib/api/contract";
import { formatMonthLabel } from "@/lib/format/date";
import { CloseBlocks, type BlockContext } from "./blocks";
import { buildFullBills, noDrafts, type BillDrafts } from "./close-bills";
import { CloseBillsEditor } from "./close-bills-editor";
import { Banner, useErrorText } from "./ui";

/**
 * "Preview report" for a month that is still open: the same answers as closing (zero-meal choice and this month's bill edits)
 * plus next month's Fixed bills. The report is built on the server inside a rolled-back change; nothing is saved.
 */
export function ReportPreview({
  messId,
  month,
  resolution,
  edits,
  editsInvalid,
  names,
  members,
  ctx,
  onZeroMeals,
}: {
  messId: number;
  month: Month;
  resolution: ZeroMealResolution | null;
  edits: CloseBillEdit[];
  editsInvalid: boolean;
  names: Record<number, string>;
  members: Member[];
  ctx: BlockContext;
  /** The preview found that nobody had meals: the parent shows the choice. */
  onZeroMeals: () => void;
}) {
  const t = useTranslations("months.preview");
  const errorText = useErrorText();
  const locale = useLocale() as AppLocale;
  const nextQ = usePreviewNextBills(messId, month.id, true);
  const run = usePreviewReport(messId, month.id);
  const [nextDrafts, setNextDrafts] = useState<BillDrafts>(noDrafts);
  const [editingNext, setEditingNext] = useState(false);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [answers, setAnswers] = useState<PreviewAnswers | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextBills = nextQ.data?.bills ?? [];
  const full = nextQ.data ? buildFullBills(nextDrafts, nextBills, members.map((m) => m.id)) : null;
  const nextLabel = formatMonthLabel(addMonth(month.starts_on), locale);

  async function show() {
    setError(null);
    const asked: PreviewAnswers = { resolution, bills: edits, nextBills: full ? full.bills : null };
    try {
      const data = await run.mutateAsync(asked);
      if (data.preview?.blocks.some((b) => b.code === "zero_meals_unresolved")) onZeroMeals();
      setAnswers(asked);
      setReport(data);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function download() {
    if (!answers) return;
    setError(null);
    setDownloading(true);
    try {
      await downloadPreviewPdf(messId, month.id, answers);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onPress={() => setEditingNext(true)} isDisabled={nextQ.isPending || nextQ.isError}>
          {t("editNext", { month: nextLabel })}
        </Button>
        <Button variant="secondary" onPress={show} isDisabled={run.isPending || editsInvalid || (full?.invalid ?? false)} data-testid="preview-report">
          {run.isPending ? t("building") : t("action")}
        </Button>
      </div>
      <p className="text-sm text-muted">{t("hint")}</p>
      {nextQ.isError ? <p className="text-sm text-muted">{t("nextUnavailable")}</p> : null}
      {error ? <Banner>{error}</Banner> : null}

      <Modal isOpen={editingNext} onOpenChange={setEditingNext}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="lg">
            <Modal.Dialog aria-label={t("nextTitle", { month: nextLabel })} className="max-h-[92dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <CloseBillsEditor
                bills={nextBills}
                names={names}
                members={members}
                drafts={nextDrafts}
                setDrafts={setNextDrafts}
                preview={undefined}
                previewing={false}
                invalid={full?.invalid ?? false}
                ctx={ctx}
                heading={t("nextTitle", { month: nextLabel })}
                hint={nextQ.data?.next_month_exists ? t("nextHintSaved") : t("nextHintCopied")}
                onDone={() => setEditingNext(false)}
                onDiscard={() => { setNextDrafts(noDrafts); setEditingNext(false); }}
              />
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal isOpen={report !== null} onOpenChange={(open) => { if (!open) setReport(null); }}>
        <Modal.Backdrop>
          <Modal.Container placement="center" size="cover">
            <Modal.Dialog aria-label={t("pageTitle")} className="max-h-[96dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {report ? (
                <div className="flex flex-col gap-4" data-testid="report-preview">
                  <div role="status" className="flex flex-col gap-2 rounded-2xl border-2 border-warning bg-warning/10 p-4" data-testid="preview-banner">
                    <p className="text-lg font-bold uppercase tracking-wide">{t("banner")}</p>
                    <p className="text-sm">{t("bannerBody")}</p>
                    {report.preview && report.preview.blocks.length > 0 ? (
                      <>
                        <p className="text-sm font-medium">{t("warnings")}</p>
                        <CloseBlocks blocks={report.preview.blocks} ctx={ctx} />
                      </>
                    ) : null}
                  </div>
                  {error ? <Banner>{error}</Banner> : null}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="ghost" className="w-full sm:w-auto" onPress={() => setReport(null)}>{t("close")}</Button>
                    <Button variant="primary" className="w-full sm:w-auto" onPress={download} isDisabled={downloading} data-testid="preview-download">
                      {downloading ? t("downloading") : t("download")}
                    </Button>
                  </div>
                  <ReportBody report={report} locale={locale} />
                </div>
              ) : null}
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}

function addMonth(startsOn: string): string {
  const [y, m] = startsOn.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}
