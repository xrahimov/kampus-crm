import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { Forbidden } from "@/features/settings/forbidden";
import { TestDetail } from "@/features/tests/test-detail";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can } from "@/server/rbac/authorize";
import { getTest, getTestOptions } from "@/server/services/tests/tests.service";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const current = await requireCurrentUser();
  if (!can(current.actor, "tests.view")) return {};
  try {
    return { title: (await getTest(current.actor, id)).name };
  } catch {
    return {};
  }
}

export default async function Page({ params }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "tests.view")) return <Forbidden />;

  let data: Awaited<ReturnType<typeof load>>;
  try {
    data = await load();
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }
  const [test, options] = data;
  return (
    <TestDetail
      test={test}
      options={options}
      can={{ update: can(current.actor, "tests.update") }}
    />
  );

  function load() {
    return Promise.all([getTest(current.actor, id), getTestOptions(current.actor)]);
  }
}
