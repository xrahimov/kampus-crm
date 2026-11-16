import type { Metadata } from "next";
import { redirect as redirectTo } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthFrame } from "@/features/auth/auth-frame";
import { SetPasswordForm } from "@/features/auth/set-password-form";
import { getCurrentUser } from "@/server/auth/current-user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("setPasswordTitle") };
}

/** Only pages of the app are accepted as the place to go on to. */
function safeNext(next: string | undefined, locale: string): string {
  const page = next && /^\/(?!\/)(?!api\/)[A-Za-z0-9_\-/?=&%.]*$/.test(next) ? next : "/dashboard";
  return page.startsWith(`/${locale}/`) ? page : `/${locale}${page}`;
}

/**
 * Offered once, right after the first sign-in with a Telegram code (A-196):
 * the person chooses a password, so next time the phone number and password
 * are enough. "Not now" goes on without one; My account offers it again.
 */
export default async function SetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await getCurrentUser();
  if (!current) redirectTo(`/api/v1/auth/expired?locale=${encodeURIComponent(locale)}`);
  const next = safeNext((await searchParams).next, locale);
  // Without a Telegram session the old password would be needed: that is My account's form.
  if (current.session.signedInWith !== "TELEGRAM") redirectTo(next);
  const t = await getTranslations("auth");
  return (
    <AuthFrame title={t("setPasswordTitle")} subtitle={t("setPasswordSubtitle")}>
      <SetPasswordForm endpoint="/auth/set-password" next={next} />
    </AuthFrame>
  );
}
