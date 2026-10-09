import type { MembershipStatus } from "@/lib/validation/groups";
import { generateToken } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { today } from "@/server/services/groups/shared";
import { appOriginFor } from "@/server/services/settings/domains.service";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";

/*
 * The parents' page (A-130): one link per family that lists every child and
 * each child's groups, with the child's own personal page one tap away. Like
 * the students' links, the token is the whole credential: the page is read-only
 * and shows nothing but this family.
 */

const CURRENT: MembershipStatus[] = ["NEW", "TRIAL", "ACTIVE", "FROZEN"];
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export interface FamilyPortalGroupDto {
  membershipId: string;
  /** The child's personal page, `/class/<token>`. */
  token: string;
  groupName: string;
  courseName: string;
  teachers: string[];
  status: MembershipStatus;
  nextLesson: { date: string; startTime: string; endTime: string } | null;
  balance: number;
  nextPaymentDate: string | null;
  unreadNews: number;
}

export interface FamilyPortalDto {
  familyName: string;
  organizationName: string;
  children: Array<{ id: string; fullName: string; groups: FamilyPortalGroupDto[] }>;
}

async function familyOf(db: DbClient, actor: Actor, studentId: string) {
  const s = await mustFind(
    db.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        branchId: true,
        familyId: true,
        branch: { select: { organizationId: true } },
      },
    }),
    "errors.studentNotFound",
  );
  if (!actor.branchIds.includes(s.branchId)) throw AppError.forbidden("errors.branchForbidden");
  return s;
}

/** The family's link, made on first use; `reset` replaces it so the old one stops working. */
export async function getFamilyLink(
  actor: Actor,
  studentId: string,
  options: { reset?: boolean } = {},
  db: DbClient = prisma,
): Promise<{ url: string } | null> {
  authorize(actor, options.reset ? "students.update" : "students.view");
  const s = await familyOf(db, actor, studentId);
  if (!s.familyId) return null;
  const family = await db.family.findUniqueOrThrow({
    where: { id: s.familyId },
    select: { portalToken: true },
  });
  let token = family.portalToken;
  if (!token || options.reset) {
    token = generateToken(18);
    await db.family.update({ where: { id: s.familyId }, data: { portalToken: token } });
  }
  const origin = await appOriginFor(s.branch.organizationId, db);
  return { url: `${origin.replace(/\/$/, "")}/family/${token}` };
}

/** Everything the parents' page shows, or null for an unknown or replaced link. */
export async function getFamilyPortal(
  token: string,
  db: DbClient = prisma,
): Promise<FamilyPortalDto | null> {
  if (!TOKEN.test(token)) return null;
  const family = await db.family.findUnique({
    where: { portalToken: token },
    select: {
      name: true,
      organizationId: true,
      organization: { select: { name: true } },
      students: {
        where: { isArchived: false },
        orderBy: { fullName: "asc" },
        select: {
          id: true,
          fullName: true,
          branchId: true,
          memberships: {
            where: { status: { in: CURRENT }, group: { status: { not: "ARCHIVED" } } },
            orderBy: { joinedAt: "asc" },
            select: {
              id: true,
              status: true,
              videoToken: true,
              group: {
                select: {
                  id: true,
                  name: true,
                  branchId: true,
                  course: { select: { name: true } },
                  teachers: { select: { user: { select: { fullName: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!family) return null;
  const memberships = family.students.flatMap((s) => s.memberships);
  const balances = await membershipBalances(
    db,
    memberships.map((m) => m.id),
  );
  const todayDate = isoToDate(today());
  const children: FamilyPortalDto["children"] = [];
  for (const s of family.students) {
    const groups: FamilyPortalGroupDto[] = [];
    for (const m of s.memberships) {
      // Older memberships may still lack a personal link; the parents' page needs one.
      // The page and its metadata render at the same time, so only the first writer wins.
      let token = m.videoToken;
      if (!token) {
        await db.groupMembership.updateMany({
          where: { id: m.id, videoToken: null },
          data: { videoToken: generateToken(18) },
        });
        const row = await db.groupMembership.findUniqueOrThrow({
          where: { id: m.id },
          select: { videoToken: true },
        });
        token = row.videoToken!;
      }
      const [nextLesson, unreadNews] = await Promise.all([
        db.lesson.findFirst({
          where: { groupId: m.group.id, date: { gte: todayDate } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          select: { date: true, startTime: true, endTime: true },
        }),
        db.announcement.count({
          where: {
            organizationId: family.organizationId,
            OR: [
              { audience: "CENTRE" },
              { audience: "BRANCH", branchId: m.group.branchId },
              { audience: "GROUP", groupId: m.group.id },
            ],
            reads: { none: { studentId: s.id } },
          },
        }),
      ]);
      const balance = balances.get(m.id);
      groups.push({
        membershipId: m.id,
        token,
        groupName: m.group.name,
        courseName: m.group.course.name,
        teachers: m.group.teachers.map((t) => t.user.fullName),
        status: m.status,
        nextLesson: nextLesson
          ? {
              date: dateToIso(nextLesson.date),
              startTime: nextLesson.startTime,
              endTime: nextLesson.endTime,
            }
          : null,
        balance: balance?.balance ?? 0,
        nextPaymentDate: balance?.nextPaymentDate ?? null,
        unreadNews,
      });
    }
    children.push({ id: s.id, fullName: s.fullName, groups });
  }
  return { familyName: family.name, organizationName: family.organization.name, children };
}
