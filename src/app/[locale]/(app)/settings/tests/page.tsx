import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { listFromSearchParams, type SearchParams } from "@/features/settings/list-params";
import { TestsSettingsPage, type TestsTab } from "@/features/tests/tests-settings-page";
import { TEST_STATUSES, type TestStatus } from "@/lib/validation/tests";
import { requireCurrentUser } from "@/server/auth/current-user";
import { can } from "@/server/rbac/authorize";
import {
  getQuestionBankOptions,
  listQuestions,
  QUESTION_SORT_FIELDS,
} from "@/server/services/tests/questions.service";
import { getTestOptions, listTests } from "@/server/services/tests/tests.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings.nav");
  return { title: t("tests") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

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
  if (!can(current.actor, "tests.view")) return <Forbidden />;

  const sp = await searchParams;
  const tab: TestsTab = str(sp.tab) === "bank" ? "bank" : "tests";
  const statusRaw = str(sp.status);
  const status = (TEST_STATUSES as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as TestStatus)
    : null;
  const subject = str(sp.subject);
  const recent = str(sp.recent) === "1";
  const list = listFromSearchParams(sp, {
    sortable: QUESTION_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });

  const [tests, questions, bankOptions, options] = await Promise.all([
    listTests(current.actor, {
      status: status ?? undefined,
      subject: tab === "tests" ? (subject ?? undefined) : undefined,
      recent,
    }),
    tab === "bank"
      ? listQuestions(current.actor, list, {
          subject: subject ?? undefined,
          topic: str(sp.topic) ?? undefined,
        })
      : Promise.resolve({ items: [], page: 1, pageSize: 20, total: 0 }),
    getQuestionBankOptions(current.actor),
    getTestOptions(current.actor),
  ]);

  return (
    <TestsSettingsPage
      tab={tab}
      tests={tests}
      filters={{ status: status ?? "ALL", subject, recent }}
      questions={questions}
      bankOptions={bankOptions}
      options={options}
      can={{
        create: can(current.actor, "tests.create"),
        update: can(current.actor, "tests.update"),
        delete: can(current.actor, "tests.delete"),
      }}
    />
  );
}
