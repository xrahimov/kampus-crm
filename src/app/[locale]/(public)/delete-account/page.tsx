import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ContactSentence,
  LegalDocument,
  LegalSection,
  legalContactEmail,
} from "@/features/legal/legal-document";
import { DeleteStudentAccount } from "@/features/student-app/delete-account";
import { Link } from "@/i18n/navigation";
import { getCurrentStudent } from "@/server/services/student-auth/current-student";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ done?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal.deletion" });
  return { title: t("title"), description: t("description") };
}

const steps = (group: Record<string, string>) => Object.values(group);

/**
 * `/delete-account`: how to delete a Kampus account, what goes and what the
 * learning centre keeps (A-267). Google Play asks for this address; a signed-in
 * student or parent can delete their account right here.
 */
export default async function Page({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { done } = await searchParams;
  const t = await getTranslations({ locale, namespace: "legal.deletion" });
  const student = await getCurrentStudent();
  const email = legalContactEmail();
  return (
    <LegalDocument
      locale={locale}
      path="/delete-account"
      title={t("title")}
      intro={t("intro")}
      testId="delete-account-page"
    >
      {done === "1" && !student ? (
        <Alert variant="success" data-testid="account-deleted">
          {t("done")}
        </Alert>
      ) : null}
      <LegalSection
        title={t("student.title")}
        points={steps(t.raw("student.steps") as Record<string, string>)}
        ordered
      >
        {student ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground" data-testid="delete-signed-in">
              {t("student.signedIn", { name: student.account.name })}
            </p>
            <DeleteStudentAccount size="default" />
          </div>
        ) : (
          <Button asChild variant="outline">
            <Link href="/student/login" data-testid="delete-student-sign-in">
              {t("student.signIn")}
            </Link>
          </Button>
        )}
      </LegalSection>
      <LegalSection
        title={t("staff.title")}
        text={t("staff.text")}
        points={steps(t.raw("staff.steps") as Record<string, string>)}
        ordered
      >
        <Button asChild variant="outline">
          <Link href="/account" data-testid="delete-staff-sign-in">
            {t("staff.signIn")}
          </Link>
        </Button>
      </LegalSection>
      <LegalSection
        title={t("deleted.title")}
        points={steps(t.raw("deleted.points") as Record<string, string>)}
      />
      <LegalSection title={t("kept.title")} text={t("kept.text")} />
      <LegalSection title={t("help.title")}>
        <ContactSentence
          sentence={email ? t("help.contactEmail", { email }) : t("help.contactNone")}
          email={email ?? ""}
          testId="delete-contact"
        />
        <p>
          <Link href="/privacy" className="font-medium underline underline-offset-4">
            {t("privacyLink")}
          </Link>
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
