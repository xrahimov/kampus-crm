import { prisma, type DbClient } from "@/server/db/prisma";
import { today } from "@/server/services/groups/shared";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import {
  childSelect,
  portalChildren,
  type FamilyPortalGroupDto,
} from "@/server/services/students/family-portal.service";
import type { StudentPrincipal } from "@/server/services/student-auth/student-auth.service";

/*
 * The signed-in student home (A-150): every student this Telegram account is
 * (or is the parent of), across groups and centres, with the next lesson, a
 * Join button while the lesson is live, the balance and the homework still to
 * do. Each group opens the student's existing personal page.
 */

/** Homework older than this is not listed as "to do" any more. */
const HOMEWORK_WINDOW_DAYS = 21;

export interface StudentHomeGroupDto extends FamilyPortalGroupDto {
  /** A video lesson is running now; the personal page joins it. */
  live: boolean;
}

export interface StudentHomeHomeworkDto {
  id: string;
  groupName: string;
  lessonDate: string;
  dueDate: string | null;
  text: string;
  returned: boolean;
  /** The personal page where the answer is sent. */
  token: string;
}

export interface StudentHomeProfileDto {
  studentId: string;
  fullName: string;
  relation: "SELF" | "CHILD";
  organizationName: string;
  groups: StudentHomeGroupDto[];
  homework: StudentHomeHomeworkDto[];
}

export interface StudentHomeDto {
  account: StudentPrincipal["account"];
  profiles: StudentHomeProfileDto[];
}

export async function getStudentHome(
  principal: StudentPrincipal,
  db: DbClient = prisma,
): Promise<StudentHomeDto> {
  const ids = [...principal.studentIds, ...principal.childIds];
  const students = await db.student.findMany({
    where: { id: { in: ids }, isArchived: false },
    orderBy: { fullName: "asc" },
    select: {
      ...childSelect,
      branch: { select: { organizationId: true, organization: { select: { name: true } } } },
    },
  });
  const since = isoToDate(today());
  since.setUTCDate(since.getUTCDate() - HOMEWORK_WINDOW_DAYS);
  const profiles: StudentHomeProfileDto[] = [];
  for (const s of students) {
    const [child] = await portalChildren(db, s.branch.organizationId, [s]);
    const groupIds = s.memberships.map((m) => m.group.id);
    const membershipIds = s.memberships.map((m) => m.id);
    const [liveRooms, homework] = await Promise.all([
      db.videoRoom.findMany({
        where: { groupId: { in: groupIds }, status: "LIVE" },
        select: { groupId: true },
      }),
      db.homework.findMany({
        where: { groupId: { in: groupIds }, lesson: { date: { gte: since } } },
        orderBy: { lesson: { date: "desc" } },
        select: {
          id: true,
          groupId: true,
          text: true,
          dueDate: true,
          lesson: { select: { date: true } },
          group: { select: { name: true } },
          submissions: {
            where: { membershipId: { in: membershipIds } },
            select: { status: true },
          },
        },
      }),
    ]);
    const live = new Set(liveRooms.map((r) => r.groupId));
    const groups: StudentHomeGroupDto[] = (child?.groups ?? []).map((g) => {
      const groupId = s.memberships.find((m) => m.id === g.membershipId)?.group.id;
      return { ...g, live: groupId ? live.has(groupId) : false };
    });
    const tokenByGroup = new Map(
      s.memberships.map((m) => [
        m.group.id,
        groups.find((g) => g.membershipId === m.id)?.token ?? "",
      ]),
    );
    const todo = homework
      .filter((h) => {
        const status = h.submissions[0]?.status;
        return status === undefined || status === "RETURNED";
      })
      .map((h) => ({
        id: h.id,
        groupName: h.group.name,
        lessonDate: dateToIso(h.lesson.date),
        dueDate: h.dueDate ? dateToIso(h.dueDate) : null,
        text: h.text.length > 200 ? `${h.text.slice(0, 197)}…` : h.text,
        returned: h.submissions[0]?.status === "RETURNED",
        token: tokenByGroup.get(h.groupId) ?? "",
      }))
      .filter((h) => h.token);
    profiles.push({
      studentId: s.id,
      fullName: s.fullName,
      relation: principal.studentIds.includes(s.id) ? "SELF" : "CHILD",
      organizationName: s.branch.organization.name,
      groups,
      homework: todo,
    });
  }
  // The person's own record first, then their children.
  profiles.sort((a, b) => (a.relation === b.relation ? 0 : a.relation === "SELF" ? -1 : 1));
  return { account: principal.account, profiles };
}
