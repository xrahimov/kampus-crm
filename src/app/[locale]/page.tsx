import { cookies, headers } from "next/headers";
import { setRequestLocale } from "next-intl/server";

import { CentrePage } from "@/features/public/centre-page";
import { redirect } from "@/i18n/navigation";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { getPublicCentreForHost } from "@/server/services/public/centre-page.service";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string; course?: string }>;
};

/**
 * The root: staff go to the dashboard. A visitor on a centre's own address
 * sees the centre's public page (A-121); elsewhere they are sent to sign in.
 */
export default async function LocaleIndex({ params, searchParams }: Props) {
  const { locale } = await params;
  const cookieStore = await cookies();
  if (!cookieStore.has(SESSION_COOKIE)) {
    const h = await headers();
    const centre = await getPublicCentreForHost(h.get("x-forwarded-host") ?? h.get("host"));
    if (centre) {
      setRequestLocale(locale);
      const sp = await searchParams;
      return (
        <CentrePage
          centre={centre}
          locale={locale}
          inviteCode={typeof sp.ref === "string" ? sp.ref.slice(0, 32) : null}
          courseId={typeof sp.course === "string" ? sp.course : null}
        />
      );
    }
    redirect({ href: "/login", locale });
  }
  redirect({ href: "/dashboard", locale });
}
