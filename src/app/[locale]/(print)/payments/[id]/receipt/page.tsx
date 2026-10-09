import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PrintButton } from "@/features/payments/print-button";
import { Receipt } from "@/features/payments/receipt";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { qrSvg } from "@/server/qr/qr";
import { can } from "@/server/rbac/authorize";
import { getReceipt } from "@/server/services/students/payments.service";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("payments.receipt");
  return { title: t("title") };
}

/** EXP §8 "To'lov qilgandan so'ng chek chiqishi": the printable receipt (A-24). */
export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "students.view")) return <Forbidden />;
  const t = await getTranslations("payments.receipt");

  let receipt;
  try {
    receipt = await getReceipt(current.actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  const qr = receipt.settings.visibleFields.includes("qr")
    ? await qrSvg(`kampus:payment:${receipt.id}`)
    : null;

  const fiscalQr =
    receipt.fiscal?.status === "ISSUED" && receipt.fiscal.receiptUrl
      ? await qrSvg(receipt.fiscal.receiptUrl)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      <Receipt receipt={receipt} qr={qr} fiscalQr={fiscalQr} locale={locale} />
    </div>
  );
}
