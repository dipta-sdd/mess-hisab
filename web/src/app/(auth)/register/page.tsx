import { Suspense } from "react";
import { RegisterForm } from "@/features/auth";

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
