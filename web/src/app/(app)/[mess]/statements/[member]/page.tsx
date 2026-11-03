import { notFound } from "next/navigation";
import { StatementPage } from "@/features/statements/statement-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ member: string }>;
  searchParams: Promise<{ month?: string | string[]; tab?: string | string[] }>;
}) {
  const memberId = Number((await params).member);
  if (!Number.isInteger(memberId) || memberId <= 0) notFound();
  const sp = await searchParams;
  const raw = sp.month;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const month = Number(Array.isArray(raw) ? raw[0] : raw);
  return <StatementPage memberId={memberId} initialMonthId={Number.isInteger(month) && month > 0 ? month : null} initialTab={tab === "report" ? "report" : "statement"} />;
}
