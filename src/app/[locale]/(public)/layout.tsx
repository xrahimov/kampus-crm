import { setRequestLocale } from "next-intl/server";

/** Pages anyone may open without signing in (public lead forms). No app shell. */
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
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
