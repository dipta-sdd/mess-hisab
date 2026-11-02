import { notFound } from "next/navigation";
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
      <AppShell>{children}</AppShell>
    </MessProvider>
  );
}
