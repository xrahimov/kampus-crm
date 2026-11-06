import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { StudentAppShell } from "@/features/student-app/app-shell";

/**
 * The public pages are what students and parents install (A-173): they carry
 * the student app's own manifest and icon instead of the staff app's.
 */
export const metadata: Metadata = {
  manifest: "/student.webmanifest",
  appleWebApp: { capable: true, title: "My Kampus", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/icons/student-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/student-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/student-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

/** Pages anyone may open without signing in (lead forms, students' pages). No app shell; each page sets its width. */
export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="flex min-h-screen items-start justify-center bg-muted/40 px-4 py-10">
      <div className="w-full">
        <StudentAppShell />
        {children}
      </div>
    </div>
  );
}
