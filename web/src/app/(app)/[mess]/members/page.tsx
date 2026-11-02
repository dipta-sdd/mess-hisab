import { StaffOnly } from "@/components/shell/staff-only";
import { MembersPage } from "@/features/members";

export default function Page() {
  return (
    <StaffOnly>
      <MembersPage />
    </StaffOnly>
  );
}
