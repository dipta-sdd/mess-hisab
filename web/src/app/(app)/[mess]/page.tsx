import { DashboardPage } from "@/features/dashboard/dashboard-page";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const raw = (await searchParams).month;
  const month = Number(Array.isArray(raw) ? raw[0] : raw);
  return <DashboardPage initialMonthId={Number.isInteger(month) && month > 0 ? month : null} />;
}
