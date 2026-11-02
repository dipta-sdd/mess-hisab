import { StaffOnly } from "@/components/shell/staff-only";
import { SettingsPage } from "@/features/settings";

export default function Page() {
  return (
    <StaffOnly>
      <SettingsPage />
    </StaffOnly>
  );
}
