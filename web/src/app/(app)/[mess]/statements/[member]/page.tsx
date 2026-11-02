import { notFound } from "next/navigation";
import { StatementPage } from "@/features/statements/statement-page";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ member: string }>;
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const memberId = Number((await params).member);
  if (!Number.isInteger(memberId) || memberId <= 0) notFound();
  const raw = (await searchParams).month;
  const month = Number(Array.isArray(raw) ? raw[0] : raw);
  return <StatementPage memberId={memberId} initialMonthId={Number.isInteger(month) && month > 0 ? month : null} />;
}
