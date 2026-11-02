import { StaffOnly } from "@/components/shell/staff-only";
import { StatementPage } from "@/features/statements/statement-page";

/** Defaults to the signed-in user's own member. */
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const raw = (await searchParams).month;
  const month = Number(Array.isArray(raw) ? raw[0] : raw);
  return (
    <StaffOnly>
      <StatementPage initialMonthId={Number.isInteger(month) && month > 0 ? month : null} />
    </StaffOnly>
  );
}
