import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/current-user";

/** Video calls for signed-in staff: no app shell, the call takes the whole screen. */
export default async function CallLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await getCurrentUser())) return redirect({ href: "/login", locale });
  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}
