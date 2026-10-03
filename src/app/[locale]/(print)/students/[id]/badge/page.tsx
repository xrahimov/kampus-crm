import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PrintButton } from "@/features/payments/print-button";
import { Forbidden } from "@/features/settings/forbidden";
import { BadgeCard } from "@/features/students/badge-card";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { qrSvg } from "@/server/qr/qr";
import { can } from "@/server/rbac/authorize";
import { prisma } from "@/server/db/prisma";
import { getOrganizationBranding } from "@/server/services/settings/shared";
import { getStudent } from "@/server/services/students/students.service";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("students.badge");
  return { title: t("title") };
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "students.view")) return <Forbidden />;
  const t = await getTranslations("students.badge");

  let student;
  try {
    student = await getStudent(current.actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  const [org, qr] = await Promise.all([
    getOrganizationBranding(prisma),
    qrSvg(`kampus:student:${id}`),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("print")} />
      </div>
      <div className="flex justify-center">
        <BadgeCard
          student={student}
          organizationName={org.name}
          qr={qr}
          labels={{ phone: t("phone"), groups: t("groups") }}
        />
      </div>
    </div>
  );
}
