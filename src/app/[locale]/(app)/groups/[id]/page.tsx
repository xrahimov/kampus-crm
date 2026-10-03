import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { GroupDetail } from "@/features/groups/group-detail";
import { Forbidden } from "@/features/settings/forbidden";
import type { SearchParams } from "@/features/settings/list-params";
import { requireCurrentUser } from "@/server/auth/current-user";
import { isAppError } from "@/server/errors/app-error";
import { can, canAccessAllBranches } from "@/server/rbac/authorize";
import {
  getGroup,
  listGroupDaysOff,
  listGroupHistory,
  listGroupNotes,
} from "@/server/services/groups/groups.service";
import { getMonthGrid } from "@/server/services/groups/lessons.service";
import { listMembers } from "@/server/services/groups/memberships.service";
import { getGroupFormOptions } from "@/server/services/groups/options.service";
import { listGroupDiscounts } from "@/server/services/students/discounts.service";
import { getPaymentOptions } from "@/server/services/students/payments.service";
import { listGroupComments } from "@/server/services/students/students.service";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<SearchParams>;
};

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const current = await requireCurrentUser();
  if (!can(current.actor, "groups.view")) return {};
  try {
    return { title: (await getGroup(current.actor, id)).name };
  } catch {
    return {};
  }
}

export default async function Page({ params, searchParams }: Props) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const current = await requireCurrentUser();
  if (!can(current.actor, "groups.view")) return <Forbidden />;

  let group;
  try {
    group = await getGroup(current.actor, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    if (isAppError(error) && error.code === "FORBIDDEN") return <Forbidden />;
    throw error;
  }

  const sp = await searchParams;
  const requestedMonth = str(sp.month);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month =
    requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)
      ? requestedMonth
      : group.months.includes(currentMonth)
        ? currentMonth
        : (group.months[0] ?? currentMonth);
  const historyPage = Math.max(1, Number(str(sp.page) ?? 1) || 1);
  const pageSize = 20;

  const [grid, members, daysOff, notes, history, options, discounts, comments, paymentOptions] =
    await Promise.all([
      getMonthGrid(current.actor, id, month),
      listMembers(current.actor, id, { archived: str(sp.archived) === "1" }),
      listGroupDaysOff(current.actor, id),
      listGroupNotes(current.actor, id),
      listGroupHistory(current.actor, id, {
        page: historyPage,
        pageSize,
        skip: (historyPage - 1) * pageSize,
        take: pageSize,
      }),
      getGroupFormOptions(current.actor),
      listGroupDiscounts(current.actor, id),
      listGroupComments(current.actor, id),
      getPaymentOptions(current.actor),
    ]);

  return (
    <GroupDetail
      group={group}
      grid={grid}
      members={members}
      daysOff={daysOff}
      notes={notes}
      history={history}
      discounts={discounts}
      comments={comments}
      paymentOptions={paymentOptions}
      options={options}
      branches={current.branches}
      actorBranchIds={current.actor.branchIds}
      activeBranchId={current.actor.activeBranchId}
      allBranches={canAccessAllBranches(current.actor)}
      can={{
        update: can(current.actor, "groups.update"),
        delete: can(current.actor, "groups.delete"),
        mark: can(current.actor, "groups.attendance.mark"),
        createStudent: can(current.actor, "students.create"),
        pay: can(current.actor, "payments.create"),
        discount: can(current.actor, "discounts.give"),
        comment: can(current.actor, "students.view"),
        leads: can(current.actor, "leads.create"),
      }}
    />
  );
}
