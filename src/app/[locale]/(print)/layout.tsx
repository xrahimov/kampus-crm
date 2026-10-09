import { setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/current-user";

/** Printable pages (receipts, badges): signed-in only, no app shell, print styles. */
export default async function PrintLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await getCurrentUser();
  if (!current) return redirect({ href: "/login", locale });
  return (
    <>
      {/* Paper is white: these pages ignore the dark theme (A-136). */}
      <script
        dangerouslySetInnerHTML={{
          __html:
            'document.documentElement.classList.remove("dark");document.documentElement.style.colorScheme="light";',
        }}
      />
      <div className="print-page mx-auto max-w-3xl p-4 print:max-w-none print:p-0">{children}</div>
    </>
  );
}
