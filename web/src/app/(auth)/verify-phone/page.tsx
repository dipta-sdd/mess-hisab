import { Suspense } from "react";
import { VerifyPhoneForm } from "@/features/auth";

export default function VerifyPhonePage() {
  return (
    <Suspense>
      <VerifyPhoneForm />
    </Suspense>
  );
}
