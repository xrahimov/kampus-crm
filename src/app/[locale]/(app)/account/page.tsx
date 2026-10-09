import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AccountPage } from "@/features/account/account-page";
import { requireCurrentUser } from "@/server/auth/current-user";
import { getAccount, listOwnSessions } from "@/server/services/account.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

/** "My account" (A-124): the person's own password, sign-in code and devices. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  const [account, sessions] = await Promise.all([
    getAccount(current.actor),
    listOwnSessions(current.actor, current.session.id),
  ]);
  return <AccountPage account={account} sessions={sessions} />;
}
