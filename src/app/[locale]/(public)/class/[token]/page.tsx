import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { PortalPage } from "@/features/portal/portal-page";
import { getPortalChat } from "@/server/services/chat/group-chat.service";
import { listPortalAnnouncements } from "@/server/services/announcements/announcements.service";
import { listPortalHomework } from "@/server/services/homework/homework.service";
import { listPortalMaterials } from "@/server/services/materials/materials.service";
import { getPortalPayOptions } from "@/server/services/payments/online-payments.service";
import { getPortal } from "@/server/services/portal/portal.service";
import { getPortalBadges } from "@/server/services/badges/badges.service";
import { getPortalGradebook } from "@/server/services/gradebook/gradebook.service";
import { listPortalStream } from "@/server/services/stream/stream.service";
import { getPortalSchedule } from "@/server/services/portal/reschedule.service";
import { getPortalProgress } from "@/server/services/progress/course-progress.service";
import { listPortalCourse } from "@/server/services/settings/topic-content.service";
import { listPortalCertificates } from "@/server/services/students/certificates.service";
import { getPortalReferral } from "@/server/services/students/referrals.service";
import { listPortalTests } from "@/server/services/tests/portal-tests.service";
import { getPortalTelegram } from "@/server/services/telegram/student-telegram.service";
import { getClassPage } from "@/server/services/video/video.service";

type Props = {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ paid?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const page = await getClassPage(token);
  return page ? { title: `${page.groupName} · ${page.organizationName}`, robots: "noindex" } : {};
}

/**
 * `/class/:token`: a student's personal page. The link was made for video
 * lessons; it now also shows the student's lessons, marks, money and results.
 */
export default async function Page({ params, searchParams }: Props) {
  const { locale, token } = await params;
  // Back from Payme or Click: open the money tab, where the outcome is shown.
  const { paid } = await searchParams;
  setRequestLocale(locale);
  const [
    page,
    portal,
    homework,
    telegram,
    materials,
    pay,
    referral,
    announcements,
    certificates,
    tests,
    course,
    progress,
    gradebook,
    badges,
    stream,
    schedule,
    chat,
  ] = await Promise.all([
    getClassPage(token),
    getPortal(token),
    listPortalHomework(token),
    getPortalTelegram(token),
    listPortalMaterials(token),
    getPortalPayOptions(token),
    getPortalReferral(token, locale),
    listPortalAnnouncements(token),
    listPortalCertificates(token),
    listPortalTests(token),
    listPortalCourse(token),
    getPortalProgress(token),
    getPortalGradebook(token),
    getPortalBadges(token),
    listPortalStream(token),
    getPortalSchedule(token),
    getPortalChat(token),
  ]);
  if (
    !page ||
    !portal ||
    !homework ||
    !telegram ||
    !materials ||
    !pay ||
    !announcements ||
    !schedule ||
    !chat
  ) {
    notFound();
  }
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PortalPage
        token={token}
        initial={page}
        portal={portal}
        homework={homework}
        telegram={telegram}
        materials={materials}
        pay={pay}
        referral={referral}
        announcements={announcements}
        chat={chat}
        certificates={certificates ?? []}
        tests={tests ?? []}
        course={course}
        progress={progress}
        gradebook={gradebook}
        badges={badges ?? []}
        stream={stream ?? []}
        schedule={schedule}
        initialTab={paid ? "money" : "lessons"}
      />
    </div>
  );
}
