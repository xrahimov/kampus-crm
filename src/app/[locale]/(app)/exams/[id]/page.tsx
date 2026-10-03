import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { ExamResults } from "@/features/exams/exam-results";
import { Forbidden } from "@/features/settings/forbidden";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can } from "@/server/rbac/authorize";
import { getExamOptions, getExamResults } from "@/server/services/exams/exams.service";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const current = await requireCurrentUser();
  if (!can(current.actor, "exams.view")) return {};
  try {
    return { title: (await getExamResults(current.actor, id)).exam.name };
  } catch {
    return {};
  }
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "exams.view")) return <Forbidden />;

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  const [{ exam, rows }, options] = data;
  return (
    <ExamResults
      exam={exam}
      rows={rows}
      options={options}
      branches={current.branches}
      can={{ update: can(current.actor, "exams.update") }}
    />
  );

  function load() {
    return Promise.all([getExamResults(current.actor, id), getExamOptions(current.actor)]);
  }
}
