import { Suspense } from "react";
import { GoogleCallback } from "@/features/auth";

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <GoogleCallback />
    </Suspense>
  );
}
