import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CashCloseSheet } from "@/features/cashdesk/close-sheet";
import { PrintButton } from "@/features/payments/print-button";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { isAppError } from "@/server/errors/app-error";
import { getCashClose } from "@/server/services/finance/cash-close.service";
import { getOrganizationBranding } from "@/server/services/settings/shared";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cashdesk.sheet");
  return { title: t("title") };
}

/** The printable hand-over sheet of a cashier's day close, with its signature lines (A-122). */
export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  const t = await getTranslations("cashdesk.sheet");

  let close;
  try {
    close = await getCashClose(current.actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  const branding = await getOrganizationBranding(prisma, current.actor.organizationId);

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      <CashCloseSheet
        close={close}
        organizationName={branding.name}
        logoUrl={branding.logoUrl}
        locale={locale}
      />
    </div>
  );
}
