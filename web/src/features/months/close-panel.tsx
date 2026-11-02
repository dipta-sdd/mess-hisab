"use client";

import { Button } from "@heroui/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CloseBlock, Month, ZeroMealResolution } from "@/lib/api/contract";
import { isApiError } from "@/lib/api-client";
import { useCloseCheck, useCloseMonth } from "./api";
import { CloseBlocks, type BlockContext } from "./blocks";
import { Banner, useErrorText } from "./ui";

/** Manager-only close flow for an open month: check, resolve blockers, confirm, close. */
export function ClosePanel({ messId, month, ctx, onClosed }: { messId: number; month: Month; ctx: BlockContext; onClosed: () => void }) {
  const t = useTranslations("months.close");
  const errorText = useErrorText();
  const [checking, setChecking] = useState(false);
  const [resolution, setResolution] = useState<ZeroMealResolution | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [serverBlocks, setServerBlocks] = useState<CloseBlock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCloseCheck(messId, month.id, resolution, checking);
  const close = useCloseMonth(messId, month.id);

  const result = check.data;
  const stale = check.isPlaceholderData || check.isFetching;
  const hasZeroBlock = Boolean(result?.blocks.some((b) => b.code === "zero_meals_unresolved"));
  const showChoice = hasZeroBlock || resolution !== null;
  const blocks = serverBlocks ?? result?.blocks ?? [];
  const canClose = Boolean(result?.can_close) && !stale && serverBlocks === null;

  async function runCheck() {
    setError(null);
    setServerBlocks(null);
    setConfirming(false);
    if (checking) await check.refetch();
    else setChecking(true);
  }

  function choose(value: ZeroMealResolution) {
    setResolution(value);
    setServerBlocks(null);
    setConfirming(false);
  }

  async function doClose() {
    setError(null);
    try {
      await close.mutateAsync(resolution);
      onClosed();
    } catch (e) {
      setConfirming(false);
      if (isApiError(e) && e.isConflict && e.code === "close_blocked") {
        const returned = (e.body as { blocks?: CloseBlock[] } | null)?.blocks;
        setServerBlocks(Array.isArray(returned) ? returned : []);
        setError(t("blockedByServer"));
      } else setError(errorText(e));
    }
  }

  return (
    <section aria-labelledby="close-title" className="flex flex-col gap-3 rounded-2xl border border-default-200 bg-surface p-4">
      <h3 id="close-title" className="text-lg font-semibold">{t("title")}</h3>
      <p className="text-sm text-muted">{t("intro")}</p>

      <div>
        <Button variant="secondary" onPress={runCheck} isDisabled={check.isFetching || close.isPending}>
          {checking ? t("recheck") : t("check")}
        </Button>
      </div>

      {error ? <Banner>{error}</Banner> : null}
      {check.isError ? <Banner>{errorText(check.error)}</Banner> : null}
      {checking && check.isPending ? <p role="status" className="text-sm text-muted">{t("checking")}</p> : null}

      {result && blocks.length > 0 ? <CloseBlocks blocks={blocks} ctx={ctx} /> : null}

      {showChoice ? (
        <fieldset className="flex flex-col gap-2 rounded-xl border border-default-200 p-3">
          <legend className="px-1 text-sm font-medium">{t("zeroMeals.legend")}</legend>
          <p className="text-sm text-muted">{t("zeroMeals.hint")}</p>
          {(["split_equal", "carry"] as const).map((value) => (
            <label key={value} className="flex min-h-11 items-start gap-2">
              <input
                type="radio"
                name={`zero-meal-${month.id}`}
                className="mt-1 size-5"
                checked={resolution === value}
                onChange={() => choose(value)}
              />
              <span>
                <span className="block font-medium">{t(`zeroMeals.${value}.label`)}</span>
                <span className="block text-sm text-muted">{t(`zeroMeals.${value}.help`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      {result && canClose && !confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t("ready")}</p>
          <div>
            <Button variant="primary" onPress={() => setConfirming(true)}>{t("action")}</Button>
          </div>
        </div>
      ) : null}

      {confirming ? (
        <div role="group" aria-label={t("confirmTitle")} className="flex flex-col gap-2 rounded-xl border border-danger p-3">
          <p className="font-medium">{t("confirmTitle")}</p>
          <p className="text-sm">{t("confirmBody")}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" className="w-full sm:w-auto" onPress={() => setConfirming(false)}>{t("cancel")}</Button>
            <Button variant="danger" className="w-full sm:w-auto" onPress={doClose} isDisabled={close.isPending}>
              {close.isPending ? t("closing") : t("confirmYes")}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
