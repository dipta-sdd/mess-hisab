import { redirect } from "next/navigation";

/** The report now lives on the Statement page as its second tab. */
export default async function Page({ params }: { params: Promise<{ mess: string }> }) {
  redirect(`/${(await params).mess}/admin/statements?tab=report`);
}
