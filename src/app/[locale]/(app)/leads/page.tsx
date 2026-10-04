import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LeadsBoard } from "@/features/leads/leads-board";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { leadFilterSchema } from "@/lib/validation/leads";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import { getBoardView, getLeadOptions } from "@/server/services/leads/leads.service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("leads");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

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
  const parsed = leadFilterSchema.safeParse({
    boardId: str(sp.board),
    q: str(sp.q),
    lessonTime: str(sp.lessonTime),
    teacherId: str(sp.teacherId),
    days: str(sp.days),
    archived: str(sp.archived),
  });
  const filters = parsed.success ? parsed.data : {};
  let view;
  try {
    view = await getBoardView(current.actor, filters);
  } catch (error) {
    // A board id from an old link: fall back to the first board.
    if (!isAppError(error) || error.code !== "NOT_FOUND") throw error;
    view = await getBoardView(current.actor, { ...filters, boardId: undefined });
  }
  const options = await getLeadOptions(current.actor);

  return (
    <LeadsBoard
      view={view}
      options={options}
      filters={filters}
      branches={current.branches}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={canAccessAllBranches(current.actor)}
      can={{
        create: can(current.actor, "leads.create"),
        update: can(current.actor, "leads.update"),
        delete: can(current.actor, "leads.delete"),
        groups: can(current.actor, "leads.update") && can(current.actor, "groups.update"),
        sms: can(current.actor, "sms.send"),
      }}
    />
  );
}
