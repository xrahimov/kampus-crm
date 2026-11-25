import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  ContactSentence,
  LegalDocument,
  LegalSection,
  legalContactEmail,
} from "@/features/legal/legal-document";
import { Link } from "@/i18n/navigation";

type Props = { params: Promise<{ locale: string }> };

interface Section {
  title: string;
  text?: string;
  points?: Record<string, string>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  return { title: `${t("title")} · Kampus`, description: t("description") };
}

/**
 * `/privacy`: the privacy policy of the Kampus app and site (A-267). Google Play
 * and the App Store link to it, so it is open to anyone and may be indexed.
 */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  const sections = t.raw("sections") as Record<string, Section>;
  const email = legalContactEmail();
  return (
    <LegalDocument
      locale={locale}
      path="/privacy"
      title={t("title")}
      intro={t("intro")}
      testId="privacy-policy"
    >
      {Object.entries(sections).map(([key, section]) => (
        <LegalSection
          key={key}
          title={section.title}
          text={section.text}
          points={section.points ? Object.values(section.points) : undefined}
        >
          {key === "who" ? (
            <ContactSentence
              sentence={email ? t("contactEmail", { email }) : t("contactNone")}
              email={email ?? ""}
              testId="privacy-contact"
            />
          ) : null}
          {key === "choices" ? (
            <p>
              <Link
                href="/delete-account"
                className="font-medium underline underline-offset-4"
                data-testid="privacy-to-deletion"
              >
                {t("deletionLink")}
              </Link>
            </p>
          ) : null}
        </LegalSection>
      ))}
    </LegalDocument>
  );
}
