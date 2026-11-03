import { StaffOnly } from "@/components/shell/staff-only";
import { MealsPage } from "@/features/meals/meals-page";

export default function Page() {
  return (
    <StaffOnly>
      <MealsPage scope="all" />
    </StaffOnly>
  );
}
