import { setRequestLocale } from "next-intl/server";

import { ComingSoon } from "@/components/layout/coming-soon";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ComingSoon module="reports" phase={12} />;
}
