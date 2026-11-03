import { StaffOnly } from "@/components/shell/staff-only";
import { ReportsPage } from "@/features/reports/report-page";

export default function Page() {
  return (
    <StaffOnly>
      <ReportsPage />
    </StaffOnly>
  );
}
