import { BadgeCheck, CircleOff } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDateOnly } from "@/lib/dates";
import { checkCertificate } from "@/server/services/students/certificates.service";

type Props = { params: Promise<{ locale: string; code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const t = await getTranslations("certificate.check");
  const found = await checkCertificate(code);
  return {
    title: found ? `${t("title")} · ${found.organization.name}` : t("title"),
    robots: "noindex",
  };
}

/** `/cert/:code`: anyone with the link or the QR code can check a certificate (A-140). */
export default async function Page({ params }: Props) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("certificate.check");
  const format = await getFormatter();
  const found = await checkCertificate(code);
  const valid = !!found && !found.revokedAt;

  return (
    <div className="mx-auto w-full max-w-md">
      <Card
        data-testid="certificate-check"
        data-status={!found ? "unknown" : valid ? "valid" : "revoked"}
      >
        <CardHeader className="items-center text-center">
          {found?.organization.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={found.organization.logoUrl} alt="" className="mx-auto mb-2 max-h-14" />
          ) : null}
          {found && <p className="text-sm text-muted-foreground">{found.organization.name}</p>}
          <CardTitle className="text-lg">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              valid
                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
            }`}
            data-testid="certificate-status"
          >
            {valid ? (
              <BadgeCheck className="size-4" aria-hidden />
            ) : (
              <CircleOff className="size-4" aria-hidden />
            )}
            {!found ? t("notFound") : valid ? t("valid") : t("revoked")}
          </div>
          {found && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("student")}</dt>
              <dd className="font-medium" data-testid="certificate-check-student">
                {found.studentName}
              </dd>
              <dt className="text-muted-foreground">{t("course")}</dt>
              <dd>
                {found.title}
                {found.title !== found.course ? ` (${found.course})` : ""}
              </dd>
              {found.level && (
                <>
                  <dt className="text-muted-foreground">{t("level")}</dt>
                  <dd>{found.level}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("issuedOn")}</dt>
              <dd>{format.dateTime(parseDateOnly(found.issuedAt), { dateStyle: "long" })}</dd>
              <dt className="text-muted-foreground">{t("number")}</dt>
              <dd className="font-mono">{found.number}</dd>
            </dl>
          )}
          {!found && (
            <p className="text-center text-sm text-muted-foreground">{t("notFoundHint")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
