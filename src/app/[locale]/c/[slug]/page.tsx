import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { CentrePage } from "@/features/public/centre-page";
import { getPublicCentreBySlug } from "@/server/services/public/centre-page.service";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ ref?: string; course?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const centre = await getPublicCentreBySlug(slug);
  return centre ? { title: centre.name, description: centre.intro ?? undefined } : {};
}

/** `/c/:slug`: a centre's public page on the server's address (A-121). */
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const centre = await getPublicCentreBySlug(slug);
  if (!centre) notFound();
  const sp = await searchParams;
  return (
    <CentrePage
      centre={centre}
      locale={locale}
      inviteCode={typeof sp.ref === "string" ? sp.ref.slice(0, 32) : null}
      courseId={typeof sp.course === "string" ? sp.course : null}
    />
  );
}
