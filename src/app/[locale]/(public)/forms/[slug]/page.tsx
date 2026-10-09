import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicLeadForm } from "@/features/leads/public-form";
import { getPublicForm } from "@/server/services/leads/forms.service";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const form = await getPublicForm(slug);
  return form ? { title: `${form.name} · ${form.organizationName}` } : {};
}

/** `/forms/:slug`: the public lead-capture page a form's link points to (EXP §8 Formalar). */
export default async function Page({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  // A student's invite link carries their code (A-120); the form sends it back with the lead.
  const { ref } = await searchParams;
  setRequestLocale(locale);
  const form = await getPublicForm(slug);
  if (!form) notFound();
  const t = await getTranslations("leads.publicForm");
  return (
    <div className="mx-auto w-full max-w-md">
      <Card>
        <CardHeader>
          {form.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.logoUrl} alt="" className="mb-2 h-12 w-auto self-start" />
          )}
          <CardTitle>{form.name}</CardTitle>
          <CardDescription>{t("intro", { organization: form.organizationName })}</CardDescription>
        </CardHeader>
        <CardContent>
          <PublicLeadForm
            slug={slug}
            inviteCode={typeof ref === "string" ? ref.slice(0, 32) : null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
