import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicLeadForm } from "@/features/leads/public-form";
import { getPublicForm } from "@/server/services/leads/forms.service";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const form = await getPublicForm(slug);
  return form ? { title: `${form.name} · ${form.organizationName}` } : {};
}

/** `/forms/:slug`: the public lead-capture page a form's link points to (EXP §8 Formalar). */
export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
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
          <PublicLeadForm slug={slug} />
        </CardContent>
      </Card>
    </div>
  );
}
