import type { Prisma } from "@/generated/prisma/client";
import type { CertificateInput } from "@/lib/validation/reports";
import { recordAudit } from "@/server/audit/audit";
import { generateToken } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { today } from "@/server/services/groups/shared";
import { appOriginFor } from "@/server/services/settings/domains.service";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Certificates of graduation (round 2 G2, A-140). One certificate per graduated
 * membership: a number, a title (the course by default), a level, the date and a
 * public code. Staff print it from the graduates report; anyone with the link or
 * the QR code can check it at /cert/<code>.
 */

export interface CertificateDto {
  id: string;
  number: string;
  code: string;
  title: string;
  level: string | null;
  issuedAt: string;
  issuedByName: string | null;
  revokedAt: string | null;
  /** Public verification address, on the centre's own domain when it has one. */
  url: string;
  student: { id: string; fullName: string };
  course: string;
  group: string;
  branch: string;
  teacher: string | null;
  /** First and last day of the membership. */
  from: string;
  to: string | null;
  organization: { name: string; logoUrl: string | null };
}

/** What the public page shows: enough to check a paper, nothing to contact anyone. */
export interface CertificateCheckDto {
  number: string;
  title: string;
  level: string | null;
  issuedAt: string;
  revokedAt: string | null;
  studentName: string;
  course: string;
  organization: { name: string; logoUrl: string | null };
}

export interface PortalCertificateDto {
  id: string;
  number: string;
  title: string;
  level: string | null;
  issuedAt: string;
  url: string;
}

const include = {
  issuedBy: { select: { fullName: true } },
  organization: { select: { name: true, logoUrl: true } },
  membership: {
    select: {
      joinedAt: true,
      leftAt: true,
      student: { select: { id: true, fullName: true } },
      group: {
        select: {
          name: true,
          branch: { select: { name: true } },
          course: { select: { name: true } },
          teachers: {
            where: { role: "MAIN" as const },
            select: { user: { select: { fullName: true } } },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.CertificateInclude;

type Row = Prisma.CertificateGetPayload<{ include: typeof include }>;

export function certificateUrl(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/cert/${code}`;
}

function toDto(row: Row, origin: string): CertificateDto {
  const m = row.membership;
  return {
    id: row.id,
    number: row.number,
    code: row.code,
    title: row.title,
    level: row.level,
    issuedAt: dateToIso(row.issuedAt),
    issuedByName: row.issuedBy?.fullName ?? null,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    url: certificateUrl(origin, row.code),
    student: { id: m.student.id, fullName: m.student.fullName },
    course: m.group.course.name,
    group: m.group.name,
    branch: m.group.branch.name,
    teacher: m.group.teachers[0]?.user.fullName ?? null,
    from: dateToIso(m.joinedAt),
    to: m.leftAt ? dateToIso(m.leftAt) : null,
    organization: row.organization,
  };
}

async function membershipFor(db: DbClient, actor: Actor, membershipId: string) {
  const membership = await mustFind(
    db.groupMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        status: true,
        studentId: true,
        graduate: { select: { cefrLevel: true } },
        group: {
          select: {
            branchId: true,
            course: { select: { name: true } },
            branch: { select: { organizationId: true } },
          },
        },
      },
    }),
  );
  if (!actor.branchIds.includes(membership.group.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  return membership;
}

/** The next number of the organisation's year: "2026-0001", "2026-0002", … */
async function nextNumber(tx: DbClient, organizationId: string, issuedAt: string) {
  const year = issuedAt.slice(0, 4);
  const last = await tx.certificate.findFirst({
    where: { organizationId, number: { startsWith: `${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const serial = last ? Number(last.number.slice(5)) + 1 : 1;
  return `${year}-${String(serial).padStart(4, "0")}`;
}

/**
 * Issues (or re-issues after a revocation) the certificate of a graduated
 * membership and tells the student on Telegram where to find it.
 */
export async function issueCertificate(
  actor: Actor,
  membershipId: string,
  input: CertificateInput,
  db: DbClient = prisma,
): Promise<CertificateDto> {
  authorize(actor, "students.update");
  const membership = await membershipFor(db, actor, membershipId);
  if (membership.status !== "GRADUATED") throw AppError.conflict("errors.notGraduated");
  const organizationId = membership.group.branch.organizationId;
  const existing = await db.certificate.findUnique({ where: { membershipId } });
  if (existing && !existing.revokedAt) throw AppError.conflict("errors.certificateExists");
  const issuedAt = input.issuedAt ?? today();
  const data = {
    title: input.title,
    level: input.level ?? membership.graduate?.cefrLevel ?? null,
    issuedAt: isoToDate(issuedAt),
    issuedById: actor.userId,
    revokedAt: null,
  };
  const origin = await appOriginFor(organizationId, db);
  const row = await db.$transaction(async (tx) => {
    const saved = existing
      ? await tx.certificate.update({
          where: { id: existing.id },
          data: { ...data, code: generateToken(12) },
          include,
        })
      : await tx.certificate.create({
          data: {
            ...data,
            organizationId,
            membershipId,
            number: await nextNumber(tx, organizationId, issuedAt),
            code: generateToken(12),
          },
          include,
        });
    await recordAudit(tx, actor, {
      action: "certificate.issue",
      entity: "Certificate",
      entityId: saved.id,
      after: { number: saved.number, title: saved.title, level: saved.level, issuedAt },
      branchId: membership.group.branchId,
    });
    await notifyStudents(tx, {
      studentIds: [membership.studentId],
      kind: "certificate",
      refKey: `certificate:${saved.id}:${saved.code}`,
      values: {
        org: saved.organization.name,
        title: saved.title,
        url: certificateUrl(origin, saved.code),
      },
    });
    return saved;
  });
  return toDto(row, origin);
}

/** Marks a certificate as withdrawn: the paper stays, the public page says "revoked". */
export async function revokeCertificate(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<CertificateDto> {
  authorize(actor, "students.update");
  const row = await mustFind(db.certificate.findUnique({ where: { id }, include }));
  const membership = await membershipFor(db, actor, row.membershipId);
  if (row.revokedAt) throw AppError.conflict("errors.certificateRevoked");
  const origin = await appOriginFor(row.organizationId, db);
  const saved = await db.$transaction(async (tx) => {
    const updated = await tx.certificate.update({
      where: { id },
      data: { revokedAt: new Date() },
      include,
    });
    await recordAudit(tx, actor, {
      action: "certificate.revoke",
      entity: "Certificate",
      entityId: id,
      before: { number: row.number, title: row.title },
      branchId: membership.group.branchId,
    });
    return updated;
  });
  return toDto(saved, origin);
}

/** One certificate for staff: the print page and the report. */
export async function getCertificate(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<CertificateDto> {
  authorize(actor, "students.view");
  const row = await mustFind(db.certificate.findUnique({ where: { id }, include }));
  await membershipFor(db, actor, row.membershipId);
  return toDto(row, await appOriginFor(row.organizationId, db));
}

/** The public check at /cert/<code>; null when no such certificate exists. */
export async function checkCertificate(
  code: string,
  db: DbClient = prisma,
): Promise<CertificateCheckDto | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) return null;
  const row = await db.certificate.findUnique({ where: { code }, include });
  if (!row) return null;
  return {
    number: row.number,
    title: row.title,
    level: row.level,
    issuedAt: dateToIso(row.issuedAt),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    studentName: row.membership.student.fullName,
    course: row.membership.group.course.name,
    organization: row.organization,
  };
}

/** The student's valid certificates, for their personal page. */
export async function listPortalCertificates(
  token: string,
  db: DbClient = prisma,
): Promise<PortalCertificateDto[] | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const rows = await db.certificate.findMany({
    where: { membership: { studentId: membership.studentId }, revokedAt: null },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      number: true,
      title: true,
      level: true,
      issuedAt: true,
      code: true,
      organizationId: true,
    },
  });
  if (rows.length === 0) return [];
  const origin = await appOriginFor(rows[0]!.organizationId, db);
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    level: r.level,
    issuedAt: dateToIso(r.issuedAt),
    url: certificateUrl(origin, r.code),
  }));
}
