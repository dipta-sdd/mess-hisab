import { StaffOnly } from "@/components/shell/staff-only";
import { FixedPage } from "@/features/fixed/fixed-page";

export default function Page() {
  return (
    <StaffOnly>
      <FixedPage />
    </StaffOnly>
  );
}
