import { StaffOnly } from "@/components/shell/staff-only";
import { ExpensesPage } from "@/features/expenses/expenses-page";

export default function Page() {
  return (
    <StaffOnly>
      <ExpensesPage scope="all" />
    </StaffOnly>
  );
}
