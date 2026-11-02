import { StaffOnly } from "@/components/shell/staff-only";
import { AuditPage } from "@/features/audit";

export default function Page() {
  return (
    <StaffOnly>
      <AuditPage />
    </StaffOnly>
  );
}
