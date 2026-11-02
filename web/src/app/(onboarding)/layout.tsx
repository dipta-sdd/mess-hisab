import { LanguageSwitcher } from "@/lib/i18n";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>
        <main>{children}</main>
      </div>
    </div>
  );
}
