import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PrintButton } from "@/features/payments/print-button";
import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { BadgeCard } from "@/features/students/badge-card";
import { STUDENT_SORT_FIELDS, studentFilterSchema } from "@/lib/validation/students";
import { requireCurrentUser } from "@/server/auth/current-user";
import { qrSvg } from "@/server/qr/qr";
import { can } from "@/server/rbac/authorize";
import { prisma } from "@/server/db/prisma";
import { getOrganizationBranding } from "@/server/services/settings/shared";
import { listStudents } from "@/server/services/students/students.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("students.badge");
  return { title: t("all") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** EXP §6 "BEYJIKLAR": badges for the current list filters, up to 100 at a time. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "students.view")) return <Forbidden />;
  const t = await getTranslations("students.badge");

  const sp = await searchParams;
  const query = listFromSearchParams(
    { ...sp, pageSize: "100" },
    { sortable: STUDENT_SORT_FIELDS, defaultSort: { field: "fullName", direction: "asc" } },
  );
  const parsed = studentFilterSchema.safeParse({
    archived: str(sp.archived),
    courseId: str(sp.courseId),
    schoolId: str(sp.schoolId),
    groupId: str(sp.groupId),
    teacherId: str(sp.teacherId),
    groupStatus: str(sp.groupStatus),
    paymentStatus: str(sp.paymentStatus),
  });
  const [page, org] = await Promise.all([
    listStudents(current.actor, query, parsed.success ? parsed.data : {}),
    getOrganizationBranding(prisma, current.actor.organizationId),
  ]);
  const qrs = await Promise.all(page.items.map((s) => qrSvg(`kampus:student:${s.id}`)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <p className="text-sm text-muted-foreground">
          {t("forStudents", { count: page.items.length })}
        </p>
        <PrintButton label={t("print")} />
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {page.items.map((s, i) => (
          <BadgeCard
            key={s.id}
            student={s}
            organizationName={org.name}
            qr={qrs[i]!}
            labels={{ phone: t("phone"), groups: t("groups") }}
          />
        ))}
      </div>
    </div>
  );
}
