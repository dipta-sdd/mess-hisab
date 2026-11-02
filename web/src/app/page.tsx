import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("app");

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">{t("name")}</h1>
    </main>
  );
}
