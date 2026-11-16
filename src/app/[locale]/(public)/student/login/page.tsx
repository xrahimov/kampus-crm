import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StudentLogin } from "@/features/student-app/student-login";
import { redirect } from "@/i18n/navigation";
import { lessonLinkGroupId } from "@/lib/lesson-link";
import { prisma } from "@/server/db/prisma";
import { normalizeHost } from "@/server/services/settings/domains.service";
import { getCurrentStudent } from "@/server/services/student-auth/current-student";
import { signInOptions } from "@/server/services/staff-telegram-login.service";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; next?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studentApp.login" });
  return { title: t("title"), robots: "noindex" };
}

const ERRORS = new Set([
  "studentNotRegistered",
  "studentLinkedElsewhere",
  "studentLoginExpired",
  "studentLoginFailed",
  "studentLinkExpired",
  "studentLoginOff",
]);

/**
 * `/student/login`: students and parents sign in with their phone and password,
 * or with a code from the Telegram bot the first time (A-150, A-196).
 */
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentStudent()) redirect({ href: "/student", locale });
  const { error, next } = await searchParams;
  const h = await headers();
  const options = await signInOptions(
    prisma,
    normalizeHost(h.get("x-forwarded-host") ?? h.get("host")),
  );
  const query = new URLSearchParams({ locale });
  if (next) query.set("next", next);
  return (
    <div className="mx-auto w-full max-w-md">
      <StudentLogin
        brand={options.brand}
        code={options.code}
        bot={options.bot}
        startUrl={options.widget ? `/api/v1/student-auth/telegram/start?${query.toString()}` : null}
        error={error && ERRORS.has(error) ? error : null}
        forLesson={lessonLinkGroupId(next) !== null}
      />
    </div>
  );
}
