import { StaffOnly } from "@/components/shell/staff-only";
import { StatementPage } from "@/features/statements/statement-page";

/** Defaults to the signed-in user's own member. */
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[]; tab?: string | string[] }> }) {
  const sp = await searchParams;
  const raw = sp.month;
  const tab = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const month = Number(Array.isArray(raw) ? raw[0] : raw);
  return (
    <StaffOnly>
      <StatementPage initialMonthId={Number.isInteger(month) && month > 0 ? month : null} initialTab={tab === "report" ? "report" : "statement"} />
    </StaffOnly>
  );
}
