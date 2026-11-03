import { StaffOnly } from "@/components/shell/staff-only";
import { PaymentsPage } from "@/features/payments/payments-page";

export default function Page() {
  return (
    <StaffOnly>
      <PaymentsPage scope="all" />
    </StaffOnly>
  );
}
