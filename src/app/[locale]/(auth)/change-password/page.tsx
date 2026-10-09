import type { Metadata } from "next";
import { redirect as redirectTo } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { PasswordForm } from "@/features/account/password-form";
import { AuthFrame } from "@/features/auth/auth-frame";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/current-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("changePasswordTitle") };
}

/**
 * Where a sign-in with a password someone else chose lands (A-124). Outside the
 * app shell on purpose: nothing else is reachable until the person has their own.
 */
export default async function ChangePasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await getCurrentUser();
  if (!current) redirectTo(`/api/v1/auth/expired?locale=${encodeURIComponent(locale)}`);
  if (!current.user.mustChangePassword) return redirect({ href: "/dashboard", locale });
  const t = await getTranslations("auth");
  return (
    <AuthFrame title={t("changePasswordTitle")} subtitle={t("changePasswordSubtitle")}>
      <PasswordForm forced />
    </AuthFrame>
  );
}
