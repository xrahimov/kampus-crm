import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { FamilyPortalPage } from "@/features/portal/family-page";
import { getFamilyPortal } from "@/server/services/students/family-portal.service";

type Props = { params: Promise<{ locale: string; token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const data = await getFamilyPortal(token);
  return data ? { title: `${data.familyName} · ${data.organizationName}`, robots: "noindex" } : {};
}

/** `/family/:token`: the parents' page (A-130), every child and their groups in one place. */
export default async function Page({ params }: Props) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const data = await getFamilyPortal(token);
  if (!data) notFound();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <FamilyPortalPage data={data} />
    </div>
  );
}
