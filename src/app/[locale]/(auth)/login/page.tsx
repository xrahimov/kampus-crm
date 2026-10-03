import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signIn") };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--color-accent),_transparent_60%)] p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-bold tracking-tight text-primary">{t("app.name")}</p>
            <p className="text-sm text-muted-foreground">{t("app.tagline")}</p>
          </div>
          <LocaleSwitcher />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("auth.signInTitle")}</CardTitle>
            <CardDescription>{t("auth.signInSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
