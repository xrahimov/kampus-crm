import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import { isLessonLinkId, lessonLinkPath } from "@/lib/lesson-link";
import { getCurrentUser } from "@/server/auth/current-user";
import { getCurrentStudent } from "@/server/services/student-auth/current-student";
import {
  lessonLinkStaffPath,
  lessonLinkTokenFor,
} from "@/server/services/video/lesson-link.service";

type Props = { params: Promise<{ locale: string; groupId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "studentApp.lessonLink" });
  return { title: t("title"), robots: "noindex" };
}

/**
 * `/student/lesson/:groupId`: the lesson link a teacher copies inside the video
 * lesson (A-195). It opens nothing by itself: a student signs in first and is
 * then taken to their own page of the group, where the lesson is joined.
 */
export default async function Page({ params }: Props) {
  const { locale, groupId } = await params;
  setRequestLocale(locale);
  const valid = isLessonLinkId(groupId);
  const student = await getCurrentStudent();
  if (student && valid) {
    const token = await lessonLinkTokenFor(student, groupId);
    if (token) redirect({ href: `/class/${token}`, locale });
  }
  // A teacher who presses their own link, or a colleague of the group.
  const staff = await getCurrentUser();
  if (staff && valid) {
    const path = await lessonLinkStaffPath(staff.actor, groupId);
    if (path) redirect({ href: path, locale });
  }
  if (!student) {
    redirect({
      href: valid
        ? { pathname: "/student/login", query: { next: lessonLinkPath(groupId) } }
        : "/student/login",
      locale,
    });
  }
  const t = await getTranslations({ locale, namespace: "studentApp.lessonLink" });
  return (
    <div className="mx-auto w-full max-w-md">
      <Card data-testid="lesson-link-other">
        <CardHeader className="space-y-2 text-center">
          <CardTitle>{t("otherTitle")}</CardTitle>
          <CardDescription>{t("otherText", { name: student!.account.name })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/student" data-testid="lesson-link-home">
              {t("toHome")}
            </Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">{t("otherHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
