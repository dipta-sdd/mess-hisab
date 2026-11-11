"use client";

import { Link } from "@/lib/nav";
import { useTranslations } from "next-intl";
import type { CloseBlock, ReopenPreview } from "@/lib/api/contract";

export interface BlockContext {
  messId: number;
  money: (paisa: number) => string;
  /** A member balance as "Due ৳X" / "Credit ৳X" / "Settled". */
  balance: (paisa: number) => string;
  nameOf: (memberId: number) => string;
  monthLabelOf: (monthId: number) => string;
}

const linkClass = "font-medium text-accent underline";

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Every close-check block as a friendly message with its data. */
export function CloseBlocks({ blocks, ctx }: { blocks: CloseBlock[]; ctx: BlockContext }) {
  const t = useTranslations("months.close.blocks");
  return (
    <ul className="flex flex-col gap-2" aria-label={t("title")}>
      {blocks.map((block, i) => (
        <li key={`${block.code}-${i}`} data-testid={`block-${block.code}`} className="break-words rounded-xl border border-warning bg-warning/10 p-3 text-sm">
          <CloseBlockBody block={block} ctx={ctx} />
        </li>
      ))}
    </ul>
  );
}

function CloseBlockBody({ block, ctx }: { block: CloseBlock; ctx: BlockContext }) {
  const t = useTranslations("months.close.blocks");
  const d = block.data;
  switch (block.code) {
    case "pending_expenses":
      return (
        <>
          <p>{t("pending_expenses", { count: num(d.count) })}</p>
          <Link className={linkClass} href={`/${ctx.messId}/admin/expenses`}>{t("pending_expenses_link")}</Link>
        </>
      );
    case "unallocated": {
      const bills = list<{ category_id: number; name: string; unallocated_paisa: number }>(d.bills);
      return (
        <>
          <p>{t("unallocated")}</p>
          <ul className="my-1 list-disc ps-5">
            {bills.map((b) => (
              <li key={b.category_id}>{t("unallocated_item", { name: b.name, amount: ctx.money(b.unallocated_paisa) })}</li>
            ))}
          </ul>
          <Link className={linkClass} href={`/${ctx.messId}/admin/fixed`}>{t("unallocated_link")}</Link>
        </>
      );
    }
    case "doesnt_pay_mismatch": {
      const rows = list<{ debtor_member_id: number; amount_paisa: number; shares_paisa: number; mismatch_paisa: number }>(d.doesnt_pay);
      return (
        <>
          <p>{t("doesnt_pay_mismatch")}</p>
          <ul className="my-1 list-disc ps-5">
            {rows.map((r) => (
              <li key={r.debtor_member_id}>
                {t("doesnt_pay_mismatch_item", {
                  name: ctx.nameOf(r.debtor_member_id),
                  amount: ctx.money(r.amount_paisa),
                  shares: ctx.money(r.shares_paisa),
                  mismatch: ctx.money(r.mismatch_paisa),
                })}
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "cash_mismatch":
      return (
        <>
          <p>{t("cash_mismatch")}</p>
          <dl className="my-1 grid grid-cols-[auto_1fr] gap-x-3 tabular-nums">
            <dt className="text-muted">{t("cash_actual")}</dt>
            <dd>{ctx.money(num(d.actual_paisa))}</dd>
            <dt className="text-muted">{t("cash_expected")}</dt>
            <dd>{ctx.money(num(d.expected_paisa))}</dd>
            <dt className="text-muted">{t("cash_difference")}</dt>
            <dd>{ctx.money(num(d.difference_paisa))}</dd>
          </dl>
        </>
      );
    case "previous_month_open": {
      const ids = list<number>(d.month_ids);
      return <p>{t("previous_month_open", { months: ids.map((id) => ctx.monthLabelOf(id)).join(", ") })}</p>;
    }
    case "zero_meals_unresolved":
      return <p>{t("zero_meals_unresolved", { amount: ctx.money(num(d.food_cost_paisa)) })}</p>;
    case "month_closed":
      return <p>{t("month_closed")}</p>;
    default:
      return <p>{t("unknown")}</p>;
  }
}

/** Reopen blocks with a plain explanation (and what to do instead). */
export function ReopenBlocks({ blocks, ctx }: { blocks: ReopenPreview["blocks"]; ctx: BlockContext }) {
  const t = useTranslations("months.reopen.blocks");
  return (
    <ul className="flex flex-col gap-2" aria-label={t("title")}>
      {blocks.map((block, i) => (
        <li key={`${block.code}-${i}`} data-testid={`block-${block.code}`} className="break-words rounded-xl border border-warning bg-warning/10 p-3 text-sm">
          <p className="font-medium">{t(`${block.code}.title`)}</p>
          <p>{t(`${block.code}.body`)}</p>
          {block.code === "not_latest_closed" ? (
            <p className="text-muted">{t("not_latest_closed.later", { months: list<number>(block.data.later_month_ids).map((id) => ctx.monthLabelOf(id)).join(", ") })}</p>
          ) : null}
          {block.code === "archive_after_close" ? (
            <p className="text-muted">{t("archive_after_close.members", { names: list<number>(block.data.member_ids).map((id) => ctx.nameOf(id)).join(", ") })}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
