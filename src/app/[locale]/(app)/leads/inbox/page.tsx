import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { InboxPage } from "@/features/leads/inbox-page";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { inboxFilterSchema } from "@/lib/validation/leads";
import { requireCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import { can } from "@/server/rbac/authorize";
import { leadChatLink, listConversations } from "@/server/services/leads/inbox.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads.inbox");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

/** "/leads/inbox" (A-146): chats with prospective students, answered from Kampus. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "leads.view")) return <Forbidden />;

  const sp = await searchParams;
  const parsed = inboxFilterSchema.safeParse({ status: str(sp.status), q: str(sp.q) });
  const filters = parsed.success ? parsed.data : { status: "open" as const };
  const [conversations, chatLink] = await Promise.all([
    listConversations(current.actor, filters),
    leadChatLink(prisma, current.actor.organizationId),
  ]);

  return (
    <InboxPage
      initial={conversations}
      filters={filters}
      chatLink={chatLink}
      initialId={str(sp.c) ?? null}
      canUpdate={can(current.actor, "leads.update")}
    />
  );
}
