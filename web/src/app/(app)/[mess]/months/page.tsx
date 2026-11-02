import { StaffOnly } from "@/components/shell/staff-only";
import { MonthsPage } from "@/features/months/months-page";

export default function Page() {
  return (
    <StaffOnly>
      <MonthsPage />
    </StaffOnly>
  );
}
