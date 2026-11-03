import { StaffOnly } from "@/components/shell/staff-only";
import { StaffDashboard } from "@/features/dashboard/staff-dashboard";

export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string | string[] }> }) {
  const raw = (await searchParams).month;
  const month = Number(Array.isArray(raw) ? raw[0] : raw);
  return (
    <StaffOnly>
      <StaffDashboard initialMonthId={Number.isInteger(month) && month > 0 ? month : null} />
    </StaffOnly>
  );
}
