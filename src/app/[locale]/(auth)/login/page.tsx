import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthFrame, brandForRequest } from "@/features/auth/auth-frame";
import { prisma } from "@/server/db/prisma";
import { normalizeHost } from "@/server/services/settings/domains.service";
import { staffSignInOptions } from "@/server/services/staff-telegram-login.service";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  const brand = await brandForRequest();
  return brand ? { title: `${t("signIn")} · ${brand.name}` } : { title: t("signIn") };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const h = await headers();
  // What this address offers: Telegram, the password, or both (A-180).
  const options = await staffSignInOptions(
    prisma,
    normalizeHost(h.get("x-forwarded-host") ?? h.get("host")),
  );
  return (
    <AuthFrame
      title={t("signInTitle")}
      subtitle={
        options.password
          ? options.telegram
            ? t("signInSubtitleBoth")
            : t("signInSubtitle")
          : t("signInSubtitleTelegram")
      }
    >
      <LoginForm telegram={options.telegram} password={options.password} />
    </AuthFrame>
  );
}
