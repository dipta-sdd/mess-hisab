"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { isApiError } from "@/lib/api-client";
import { useMess } from "@/lib/mess/mess-context";
import { DEFAULT_MAX_POLLS, DEFAULT_POLL_MS, useCreateExport, useExportStatus, type ExportType } from "./api";

export interface ExportButtonProps {
  type: ExportType;
  monthId: number;
  /** Required for `statement`. */
  memberId?: number;
  /** Overrides the default label. */
  label?: string;
  pollMs?: number;
  maxPolls?: number;
}

const linkClass =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-accent px-4 py-2 text-base font-medium text-accent-foreground underline-offset-2 hover:underline focus:outline-2 focus:outline-offset-2 focus:outline-accent";

/**
 * Requests an Excel export, polls until it is ready, then shows a download link.
 * Reusable on any page inside `(app)/[mess]`.
 */
export function ExportButton({ type, monthId, memberId, label, pollMs = DEFAULT_POLL_MS, maxPolls = DEFAULT_MAX_POLLS }: ExportButtonProps) {
  const t = useTranslations("export");
  const { messId } = useMess();
  const create = useCreateExport(messId);
  const [exportId, setExportId] = useState<number | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const status = useExportStatus(messId, exportId, pollMs, maxPolls);

  const data = status.data;
  const waiting = exportId !== null && !status.isError && data?.status !== "done" && data?.status !== "failed";
  const timedOut = waiting && status.polls >= maxPolls;
  const failed = data?.status === "failed" || (exportId !== null && status.isError);
  const ready = data?.status === "done" && data.download_url;
  const defaultLabel = type === "month" ? t("month") : t("statement");

  async function start() {
    setRequestError(null);
    setExportId(null);
    try {
      const created = await create.mutateAsync({ type, month_id: monthId, ...(type === "statement" ? { member_id: memberId } : {}) });
      setExportId(created.id);
    } catch (error) {
      setRequestError(isApiError(error) && error.isValidation ? t("errors.invalid") : isApiError(error) && error.isForbidden ? t("errors.forbidden") : t("errors.request"));
    }
  }

  const busy = create.isPending || (waiting && !timedOut);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" onPress={start} isDisabled={busy || (type === "statement" && memberId === undefined)}>
        {label ?? defaultLabel}
      </Button>
      {busy ? <p role="status" className="text-sm text-muted">{t("preparing")}</p> : null}
      {ready ? (
        <a className={linkClass} href={data.download_url ?? undefined} download>
          {t("download")}
        </a>
      ) : null}
      {failed ? <p role="alert" className="text-sm text-danger">{t("failed")}</p> : null}
      {timedOut ? <p role="alert" className="text-sm text-danger">{t("timedOut")}</p> : null}
      {requestError ? <p role="alert" className="text-sm text-danger">{requestError}</p> : null}
    </div>
  );
}
