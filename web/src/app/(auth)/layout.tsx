import { LanguageSwitcher } from "@/lib/i18n";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 px-4 py-6">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <main className="flex flex-1 flex-col justify-center">{children}</main>
      </div>
    </div>
  );
}
