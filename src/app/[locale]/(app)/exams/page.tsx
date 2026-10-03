import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { ExamsPage } from "@/features/exams/exams-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { Alert } from "@/components/ui/alert";
import { EXAM_STATUSES, EXAM_TYPES, type ExamStatus, type ExamType } from "@/lib/validation/exams";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can } from "@/server/rbac/authorize";
import { getExamOptions, listExams } from "@/server/services/exams/exams.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("exams");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Default range: one month back to one month ahead (EXP §7 "Dan – Gacha"). */
function shiftMonths(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

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
  if (!can(current.actor, "exams.view")) return <Forbidden />;

  const sp = await searchParams;
  const rawType = str(sp.type);
  const type: ExamType = (EXAM_TYPES as readonly string[]).includes(rawType ?? "")
    ? (rawType as ExamType)
    : "GROUP";
  const rawStatus = str(sp.status);
  const status: ExamStatus | "ALL" =
    rawStatus === "ALL" || (EXAM_STATUSES as readonly string[]).includes(rawStatus ?? "")
      ? (rawStatus as ExamStatus | "ALL")
      : "NOT_STARTED";
  const from = DATE.test(str(sp.from) ?? "") ? str(sp.from)! : shiftMonths(-1);
  const to = DATE.test(str(sp.to) ?? "") ? str(sp.to)! : shiftMonths(1);
  const groupId = str(sp.groupId) ?? undefined;

  let data: Awaited<ReturnType<typeof load>> | null = null;
  try {
    data = await load();
  } catch (error) {
    if (!(isAppError(error) && error.code === "FORBIDDEN")) throw error;
  }
  if (!data) {
    const t = await getTranslations("exams");
    return <Alert>{t("hidden")}</Alert>;
  }
  const [list, options] = data;
  return (
    <ExamsPage
      list={list}
      filters={{ type, status, groupId, from, to }}
      options={options}
      branches={current.branches}
      can={{
        create: can(current.actor, "exams.create"),
        update: can(current.actor, "exams.update"),
        delete: can(current.actor, "exams.delete"),
      }}
    />
  );

  function load() {
    return Promise.all([
      listExams(current.actor, {
        type,
        status: status === "ALL" ? undefined : status,
        groupId,
        from,
        to,
      }),
      getExamOptions(current.actor),
    ]);
  }
}
