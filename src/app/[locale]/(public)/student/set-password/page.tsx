import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { redirect } from "@/i18n/navigation";
import { getCurrentStudent } from "@/server/services/student-auth/current-student";
import { safeNext } from "@/server/services/student-auth/student-auth.service";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("setPasswordTitle"), robots: "noindex" };
}

/**
 * `/student/set-password`: a student or parent chooses a password (A-196).
 * Offered once after the first sign-in with a Telegram code, and open from the
 * student home at any time, where it also changes an existing password.
 */
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const principal = await getCurrentStudent();
  if (!principal) redirect({ href: "/student/login", locale });
  const next = safeNext((await searchParams).next) || `/${locale}/student`;
  const t = await getTranslations("auth");
  const hadPassword = principal!.account.hasPassword;
  return (
    <div className="mx-auto w-full max-w-md">
      <Card data-testid="student-set-password">
        <CardHeader>
          <CardTitle>{t(hadPassword ? "changePasswordHeading" : "setPasswordTitle")}</CardTitle>
          <CardDescription>
            {t(hadPassword ? "changePasswordHint" : "setPasswordSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SetPasswordForm
            endpoint="/student-auth/password"
            next={next}
            hadPassword={hadPassword}
            askCurrent={hadPassword && principal!.signedInWith !== "TELEGRAM"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
