import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthFrame, brandForRequest } from "@/features/auth/auth-frame";

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
  return (
    <AuthFrame title={t("signInTitle")} subtitle={t("signInSubtitle")}>
      <LoginForm />
    </AuthFrame>
  );
}
