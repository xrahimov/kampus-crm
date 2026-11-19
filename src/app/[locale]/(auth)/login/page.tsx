import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthFrame, brandForRequest } from "@/features/auth/auth-frame";
import { HelpVideo } from "@/features/help/help-video";
import { helpVideoSrc, helpVideoText } from "@/features/help/videos";
import { prisma } from "@/server/db/prisma";
import { availableHelpVideos } from "@/server/help-videos";
import { normalizeHost } from "@/server/services/settings/domains.service";
import { signInOptions } from "@/server/services/staff-telegram-login.service";

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
  // What this address offers besides the password: a code from the bot (A-196).
  const options = await signInOptions(
    prisma,
    normalizeHost(h.get("x-forwarded-host") ?? h.get("host")),
  );
  return (
    <AuthFrame
      title={t("signInTitle")}
      subtitle={options.code ? t("signInSubtitleCode") : t("signInSubtitle")}
    >
      <LoginForm code={options.code} bot={options.bot} widget={options.widget} />
      {/* The how-to video about signing in, where this server has it (A-199). */}
      {(await availableHelpVideos(locale)).has("sign-in") && (
        <HelpVideo
          compact
          className="mt-4"
          src={helpVideoSrc(locale, "sign-in")}
          title={helpVideoText(locale, "sign-in").title}
          label={(await getTranslations("help"))("video")}
        />
      )}
    </AuthFrame>
  );
}
