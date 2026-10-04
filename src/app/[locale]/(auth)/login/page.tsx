import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { KampusMark, KampusWordmark } from "@/components/brand/logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";

import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("signIn") };
}

/**
 * Split sign-in: the lapis panel states what Kampus is, the porcelain side
 * holds the form. On narrow screens the panel collapses to the wordmark.
 */
export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="relative hidden flex-col justify-end overflow-hidden bg-sidebar p-10 text-white lg:flex">
        <div className="relative z-10 max-w-sm">
          <h2 className="text-4xl leading-tight font-semibold tracking-tight">{t("app.name")}</h2>
          <p className="mt-3 text-lg text-sidebar-foreground">{t("app.tagline")}</p>
        </div>
        <KampusMark className="absolute -right-24 -bottom-24 size-[28rem] opacity-[0.12]" />
      </section>

      <section className="flex min-h-screen flex-col px-6 py-6 lg:min-h-0 lg:px-16">
        <div className="flex items-center justify-between">
          <KampusWordmark name={t("app.name")} className="lg:invisible" />
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="text-2xl font-semibold tracking-tight">{t("auth.signInTitle")}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t("auth.signInSubtitle")}</p>
            <div className="mt-8">
              <LoginForm />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
