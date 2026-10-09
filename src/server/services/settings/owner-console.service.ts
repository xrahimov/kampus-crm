import type { Prisma } from "@/generated/prisma/client";
import type { OrganizationSuspendInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorizeSiteOwner, type Actor } from "@/server/rbac/authorize";
import { getStorage } from "@/server/storage/local";

import { mustFind } from "./shared";

/*
 * Site-owner console (A-144): what the owner of the server needs to know about
 * each centre it hosts (how much it uses, whether anyone still signs in, which
 * integrations are on), the switch that suspends a centre, and a full export of
 * a centre's data for its owner.
 */

export interface OrganizationUsage {
  groupsCount: number;
  archivedStudentsCount: number;
  /** The last successful sign-in of anyone in the centre; null when nobody ever did. */
  lastSignInAt: string | null;
  /** Bytes of uploaded files the centre's records point at (photos, materials, homework). */
  storageBytes: number;
  /** Providers switched on under Settings → Integrations. */
  integrations: string[];
}

const FILE_PREFIX = "/api/v1/files/";

function keyOf(url: string | null): string | null {
  if (!url || !url.startsWith(FILE_PREFIX)) return null;
  return url.slice(FILE_PREFIX.length).split("?")[0] ?? null;
}

async function storageBytesOf(db: DbClient, organizationId: string): Promise<number> {
  const branch = { organizationId };
  const [org, students, users, materials, homework, submissions] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { logoUrl: true } }),
    db.student.findMany({
      where: { branch, photoUrl: { not: null } },
      select: { photoUrl: true },
    }),
    db.user.findMany({
      where: { organizationId, photoUrl: { not: null } },
      select: { photoUrl: true },
    }),
    db.lessonMaterial.findMany({
      where: { group: { branch } },
      select: { url: true, size: true },
    }),
    db.homework.findMany({
      where: { group: { branch }, attachmentUrl: { not: null } },
      select: { attachmentUrl: true },
    }),
    db.homeworkSubmission.findMany({
      where: { membership: { group: { branch } } },
      select: { attachmentUrl: true, teacherAudioUrl: true },
    }),
  ]);
  let total = 0;
  const keys: string[] = [];
  const add = (url: string | null) => {
    const key = keyOf(url);
    if (key) keys.push(key);
  };
  add(org?.logoUrl ?? null);
  for (const s of students) add(s.photoUrl);
  for (const u of users) add(u.photoUrl);
  for (const m of materials) {
    if (m.size !== null) total += m.size;
    else add(m.url);
  }
  for (const h of homework) add(h.attachmentUrl);
  for (const s of submissions) {
    add(s.attachmentUrl);
    add(s.teacherAudioUrl);
  }
  const storage = getStorage();
  const sizes = await Promise.all(keys.map((k) => storage.size(k).catch(() => null)));
  for (const size of sizes) total += size ?? 0;
  return total;
}

export async function organizationUsage(
  db: DbClient,
  organizationId: string,
): Promise<OrganizationUsage> {
  const branch = { organizationId };
  const [groupsCount, archivedStudentsCount, lastLogin, integrations, storageBytes] =
    await Promise.all([
      db.group.count({ where: { branch, status: { not: "ARCHIVED" } } }),
      db.student.count({ where: { branch, isArchived: true } }),
      db.loginLog.findFirst({
        where: { success: true, user: { organizationId } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      db.integrationSetting.findMany({
        where: { organizationId, isEnabled: true },
        select: { provider: true },
        orderBy: { provider: "asc" },
      }),
      storageBytesOf(db, organizationId),
    ]);
  return {
    groupsCount,
    archivedStudentsCount,
    lastSignInAt: lastLogin?.createdAt.toISOString() ?? null,
    storageBytes,
    integrations: integrations.map((i) => i.provider),
  };
}

/**
 * Suspends or resumes a centre. Suspending ends every session of its people
 * (the site owner's excepted) and refuses their sign-ins with a clear message;
 * the data stays untouched. The owner cannot suspend their own centre.
 */
export async function setOrganizationSuspended(
  actor: Actor,
  id: string,
  input: OrganizationSuspendInput,
  db: DbClient = prisma,
): Promise<{ suspendedAt: string | null; suspendedReason: string | null }> {
  authorizeSiteOwner(actor);
  if (id === actor.organizationId) throw AppError.conflict("errors.ownOrganization");
  const before = await mustFind(
    db.organization.findUnique({
      where: { id },
      select: { suspendedAt: true, suspendedReason: true },
    }),
  );
  return db.$transaction(async (tx) => {
    const row = await tx.organization.update({
      where: { id },
      data: input.suspended
        ? { suspendedAt: before.suspendedAt ?? new Date(), suspendedReason: input.reason || null }
        : { suspendedAt: null, suspendedReason: null },
      select: { suspendedAt: true, suspendedReason: true },
    });
    if (input.suspended) {
      await tx.session.deleteMany({ where: { user: { organizationId: id, isSiteOwner: false } } });
    }
    await recordAudit(tx, actor, {
      action: input.suspended ? "organization.suspend" : "organization.resume",
      entity: "Organization",
      entityId: id,
      before: { suspendedAt: before.suspendedAt?.toISOString() ?? null },
      after: {
        suspendedAt: row.suspendedAt?.toISOString() ?? null,
        reason: row.suspendedReason,
      },
      branchId: null,
    });
    return {
      suspendedAt: row.suspendedAt?.toISOString() ?? null,
      suspendedReason: row.suspendedReason,
    };
  });
}

/** What a centre's export carries: every table of theirs, secrets left out. */
export interface OrganizationExport {
  exportedAt: string;
  format: "kampus-organization/1";
  organization: Record<string, unknown>;
  tables: Record<string, unknown[]>;
}

const USER_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  gender: true,
  birthDate: true,
  hireDate: true,
  photoUrl: true,
  isArchived: true,
  createdAt: true,
  roles: { select: { role: { select: { code: true, name: true } } } },
  branches: { select: { branchId: true } },
} satisfies Prisma.UserSelect;

/**
 * Every record of the centre as one JSON document, for the centre's owner to
 * take away or for a move to another server. Passwords, session tokens, login
 * logs and integration credentials are not part of it.
 */
export async function exportOrganization(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<OrganizationExport> {
  authorizeSiteOwner(actor);
  const org = await mustFind(
    db.organization.findUnique({
      where: { id },
      include: { settings: true, receiptSettings: true },
    }),
  );
  const branch = { organizationId: id };
  const group = { branch };
  const student = { branch };
  const tables: Record<string, unknown[]> = {};
  const [
    branches,
    users,
    roles,
    courses,
    rooms,
    daysOff,
    gradingSystems,
    paymentMethods,
    schools,
    leadSources,
    groups,
    memberships,
    students,
    parents,
    families,
    payments,
    adjustments,
    legacyPayments,
    instalments,
    discounts,
    lessons,
    attendance,
    grades,
    homework,
    exams,
    examResults,
    leads,
    financeCategories,
    financeEntries,
    payrollRuns,
    certificates,
    waitlist,
  ] = await Promise.all([
    db.branch.findMany({ where: { organizationId: id } }),
    db.user.findMany({ where: { organizationId: id }, select: USER_SELECT }),
    db.role.findMany({ where: { OR: [{ organizationId: id }, { organizationId: null }] } }),
    db.course.findMany({ where: { branch } }),
    db.room.findMany({ where: { branch } }),
    db.dayOff.findMany({ where: { branch } }),
    db.gradingSystem.findMany({ where: { organizationId: id }, include: { levels: true } }),
    db.paymentMethod.findMany({ where: { organizationId: id } }),
    db.school.findMany({ where: { organizationId: id } }),
    db.leadSource.findMany({ where: { organizationId: id } }),
    db.group.findMany({ where: group, include: { slots: true, teachers: true } }),
    db.groupMembership.findMany({ where: { group } }),
    db.student.findMany({
      where: student,
      omit: { passwordHash: true, telegramCode: true, referralCode: true },
      include: { customFields: true, comments: true },
    }),
    db.parent.findMany({ where: { student } }),
    db.family.findMany({ where: { organizationId: id } }),
    db.payment.findMany({ where: { branch } }),
    db.balanceAdjustment.findMany({ where: { branch } }),
    db.legacyPayment.findMany({ where: { branch } }),
    db.instalment.findMany({ where: { membership: { group } } }),
    db.discount.findMany({ where: { membership: { group } } }),
    db.lesson.findMany({ where: { group } }),
    db.attendance.findMany({ where: { lesson: { group } } }),
    db.grade.findMany({ where: { lesson: { group } } }),
    db.homework.findMany({ where: { group }, include: { submissions: true } }),
    db.exam.findMany({ where: { branch } }),
    db.examResult.findMany({ where: { exam: { branch } } }),
    db.lead.findMany({ where: { branch } }),
    db.financeCategory.findMany({ where: { organizationId: id } }),
    db.financeEntry.findMany({ where: { branch } }),
    db.payrollRun.findMany({ where: { organizationId: id }, include: { lines: true } }),
    db.certificate.findMany({ where: { organizationId: id } }),
    db.waitlistEntry.findMany({ where: { branch } }),
  ]);
  Object.assign(tables, {
    branches,
    users,
    roles,
    courses,
    rooms,
    daysOff,
    gradingSystems,
    paymentMethods,
    schools,
    leadSources,
    groups,
    memberships,
    students,
    parents,
    families,
    payments,
    adjustments,
    legacyPayments,
    instalments,
    discounts,
    lessons,
    attendance,
    grades,
    homework,
    exams,
    examResults,
    leads,
    financeCategories,
    financeEntries,
    payrollRuns,
    certificates,
    waitlist,
  });
  await recordAudit(db, actor, {
    action: "organization.export",
    entity: "Organization",
    entityId: id,
    after: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
    branchId: null,
  });
  return {
    exportedAt: new Date().toISOString(),
    format: "kampus-organization/1",
    organization: {
      id: org.id,
      name: org.name,
      domain: org.domain,
      logoUrl: org.logoUrl,
      createdAt: org.createdAt,
      suspendedAt: org.suspendedAt,
      settings: org.settings,
      receiptSettings: org.receiptSettings,
    },
    tables,
  };
}
