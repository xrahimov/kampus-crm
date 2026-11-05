import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StudentLogin } from "@/features/student-app/student-login";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/server/db/prisma";
import { normalizeHost } from "@/server/services/settings/domains.service";
import { getCurrentStudent } from "@/server/services/student-auth/current-student";
import { resolveLoginSetup } from "@/server/services/student-auth/student-auth.service";

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

/** `/student/login`: "Log in with Telegram" for students and parents (A-150). No passwords. */
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (await getCurrentStudent()) redirect({ href: "/student", locale });
  const { error, next } = await searchParams;
  const h = await headers();
  const setup = await resolveLoginSetup(
    prisma,
    normalizeHost(h.get("x-forwarded-host") ?? h.get("host")),
  );
  const query = new URLSearchParams({ locale });
  if (next) query.set("next", next);
  return (
    <div className="mx-auto w-full max-w-md">
      <StudentLogin
        brand={setup?.brand ?? null}
        available={Boolean(setup)}
        startUrl={`/api/v1/student-auth/telegram/start?${query.toString()}`}
        botUrl={setup?.botUsername ? `https://t.me/${setup.botUsername}?start=login` : null}
        error={error && ERRORS.has(error) ? error : null}
      />
    </div>
  );
}
