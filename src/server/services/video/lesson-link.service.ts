import { isLessonLinkId } from "@/lib/lesson-link";
import { generateToken } from "@/server/auth/tokens";
import type { Actor } from "@/server/rbac/authorize";
import { can } from "@/server/rbac/authorize";
import { prisma, type DbClient } from "@/server/db/prisma";
import { isAppError } from "@/server/errors/app-error";
import type { StudentPrincipal } from "@/server/services/student-auth/student-auth.service";
import { getGroupVideo, JOINABLE } from "@/server/services/video/video.service";

/*
 * The lesson link of a group (A-195), `/student/lesson/<groupId>`: the address
 * a teacher copies inside the video lesson and sends to the whole group. It is
 * not a credential. A signed-in student (or a parent) who is in the group is
 * taken to their own page of the group, where the lesson is joined; everybody
 * else learns nothing about the group, not even whether it exists.
 */

/**
 * The personal page a signed-in student or parent opens for this group: the
 * token of their own membership first, then a child's. Null when nobody behind
 * the account is a current student of the group.
 */
export async function lessonLinkTokenFor(
  principal: StudentPrincipal,
  groupId: string,
  db: DbClient = prisma,
): Promise<string | null> {
  if (!isLessonLinkId(groupId)) return null;
  const ids = [...principal.studentIds, ...principal.childIds];
  if (ids.length === 0) return null;
  const memberships = await db.groupMembership.findMany({
    where: {
      groupId,
      studentId: { in: ids },
      status: { in: [...JOINABLE] },
      student: { isArchived: false },
      group: { status: { not: "ARCHIVED" } },
    },
    orderBy: { joinedAt: "desc" },
    select: { id: true, studentId: true, videoToken: true },
  });
  const mine =
    memberships.find((m) => principal.studentIds.includes(m.studentId)) ?? memberships[0];
  if (!mine) return null;
  if (mine.videoToken) return mine.videoToken;
  // An older membership may still lack its personal link; only the first writer wins.
  await db.groupMembership.updateMany({
    where: { id: mine.id, videoToken: null },
    data: { videoToken: generateToken(18) },
  });
  const row = await db.groupMembership.findUniqueOrThrow({
    where: { id: mine.id },
    select: { videoToken: true },
  });
  return row.videoToken;
}

/**
 * Where a signed-in staff member lands on a lesson link: the running call of
 * the group, else the group's page. Null when the group is not theirs to see.
 */
export async function lessonLinkStaffPath(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<string | null> {
  if (!isLessonLinkId(groupId) || !can(actor, "groups.view")) return null;
  try {
    const video = await getGroupVideo(actor, groupId, db);
    return video.room ? `/video/${video.room.id}` : `/groups/${groupId}`;
  } catch (error) {
    if (isAppError(error)) return null;
    throw error;
  }
}
