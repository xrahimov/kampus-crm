import { prisma, type DbClient } from "@/server/db/prisma";
import { can, type Actor } from "@/server/rbac/authorize";
import { ownGroupsOnly } from "@/server/services/groups/shared";

/**
 * Whether this person may add students: `students.create`, or a teacher-only
 * user when the centre's switch "Teachers can add students" is on (A-61). The
 * pages use it to show the buttons, the services to allow the write.
 */
export async function canCreateStudents(actor: Actor, db: DbClient = prisma): Promise<boolean> {
  if (can(actor, "students.create")) return true;
  if (!ownGroupsOnly(actor)) return false;
  const settings = await db.orgSettings.findFirst({
    where: { organizationId: actor.organizationId },
    select: { teacherCanAddStudents: true },
  });
  return Boolean(settings?.teacherCanAddStudents);
}
