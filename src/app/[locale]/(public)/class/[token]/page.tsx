import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PortalPage } from "@/features/portal/portal-page";
import { listPortalHomework } from "@/server/services/homework/homework.service";
import { listPortalMaterials } from "@/server/services/materials/materials.service";
import { getPortalPayOptions } from "@/server/services/payments/online-payments.service";
import { getPortal } from "@/server/services/portal/portal.service";
import { getPortalTelegram } from "@/server/services/telegram/student-telegram.service";
import { getClassPage } from "@/server/services/video/video.service";

type Props = {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ paid?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const page = await getClassPage(token);
  return page ? { title: `${page.groupName} · ${page.organizationName}`, robots: "noindex" } : {};
}

/**
 * `/class/:token`: a student's personal page. The link was made for video
 * lessons; it now also shows the student's lessons, marks, money and results.
 */
export default async function Page({ params, searchParams }: Props) {
  const { locale, token } = await params;
  // Back from Payme or Click: open the money tab, where the outcome is shown.
  const { paid } = await searchParams;
  setRequestLocale(locale);
  const [page, portal, homework, telegram, materials, pay] = await Promise.all([
    getClassPage(token),
    getPortal(token),
    listPortalHomework(token),
    getPortalTelegram(token),
    listPortalMaterials(token),
    getPortalPayOptions(token),
  ]);
  if (!page || !portal || !homework || !telegram || !materials || !pay) notFound();
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PortalPage
        token={token}
        initial={page}
        portal={portal}
        homework={homework}
        telegram={telegram}
        materials={materials}
        pay={pay}
        initialTab={paid ? "money" : "lessons"}
      />
    </div>
  );
}
