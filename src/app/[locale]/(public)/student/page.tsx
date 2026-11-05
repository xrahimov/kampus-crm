import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { StudentHome } from "@/features/student-app/student-home";
import { redirect } from "@/i18n/navigation";
import { getCurrentStudent } from "@/server/services/student-auth/current-student";
import { getStudentHome } from "@/server/services/student-auth/student-home.service";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studentApp" });
  return { title: t("title"), robots: "noindex" };
}

/** `/student`: the signed-in student or parent's home (A-150). */
export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const principal = await getCurrentStudent();
  if (!principal) redirect({ href: "/student/login", locale });
  const data = await getStudentHome(principal!);
  return (
    <div className="mx-auto w-full max-w-2xl">
      <StudentHome data={data} />
    </div>
  );
}
