import { notFound } from "next/navigation";
import { PhoneGate } from "@/components/auth/phone-gate";
import { AppShell } from "@/components/shell/app-shell";
import { MessProvider } from "@/lib/mess/mess-context";

export default async function MessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ mess: string }>;
}) {
  const messId = Number((await params).mess);
  if (!Number.isInteger(messId) || messId <= 0) notFound();

  return (
    <MessProvider messId={messId}>
      <PhoneGate>
        <AppShell>{children}</AppShell>
      </PhoneGate>
    </MessProvider>
  );
}
