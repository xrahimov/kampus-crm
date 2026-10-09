import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { PrintButton } from "@/features/payments/print-button";
import { Forbidden } from "@/features/settings/forbidden";
import { CertificateSheet } from "@/features/students/certificate-sheet";
import { Link } from "@/i18n/navigation";
import { parseDateOnly } from "@/lib/dates";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { qrSvg } from "@/server/qr/qr";
import { can } from "@/server/rbac/authorize";
import { getCertificate } from "@/server/services/students/certificates.service";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("certificate");
  return { title: t("heading") };
}

/** `/certificates/:id`: the printable certificate of a graduate (A-140). */
export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "students.view")) return <Forbidden />;
  const t = await getTranslations("certificate");
  const format = await getFormatter();

  let certificate;
  try {
    certificate = await getCertificate(current.actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  const qr = await qrSvg(certificate.url);
  const long = (iso: string) => format.dateTime(parseDateOnly(iso), { dateStyle: "long" });

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href="/reports/graduates" className="text-sm text-muted-foreground hover:underline">
          ← {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>
      <CertificateSheet
        certificate={certificate}
        qr={qr}
        dates={{
          issuedAt: long(certificate.issuedAt),
          from: long(certificate.from),
          to: certificate.to ? long(certificate.to) : null,
        }}
        labels={{
          heading: t("heading"),
          confirms: t("confirms"),
          completed: t("completed"),
          level: t("level"),
          period: t("period"),
          issuedOn: t("issuedOn"),
          number: t("number"),
          teacher: t("teacher"),
          director: t("director"),
          verify: t("verify"),
          revoked: t("revoked"),
        }}
      />
    </div>
  );
}
