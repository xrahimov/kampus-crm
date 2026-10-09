import { randomInt } from "node:crypto";

import type { ReferralsReportFilters } from "@/lib/validation/reports";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { awardAutoCoins } from "@/server/services/coins/coins.service";
import {
  branchIn,
  monthKey,
  monthPeriod,
  monthsOfYear,
  num,
  reportBranch,
} from "@/server/services/reports/shared";
import { appOriginFor } from "@/server/services/settings/domains.service";
import { today } from "@/server/services/groups/shared";
import {
  dateToIso,
  isoToDate,
  organizationOfBranch,
  prismaCode,
} from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Referral programme (A-120). Every student has an invite code; the public lead
 * form takes it as `?ref=`, so a lead knows who brought it, and staff can name
 * the referrer on a lead or a student by hand. When the brought student has a
 * group, the referrer is credited once: coins through the REFERRAL coin rule
 * and, when the centre set one, a payment bonus on their current membership.
 */

/** No 0/O or 1/I, so a code read out loud survives. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CURRENT = ["NEW", "TRIAL", "ACTIVE"] as const;

export interface PortalReferralDto {
  code: string;
  /** The centre's public lead form with the code, or null when it has no active form. */
  link: string | null;
  /** Friends who joined a group through this student. */
  joined: number;
}

export interface ReferrerRowDto {
  studentId: string;
  fullName: string;
  leads: number;
  joined: number;
  coins: number;
  bonus: number;
}

export interface ReferredRowDto {
  id: string;
  fullName: string;
  phone: string | null;
  referrerName: string;
  createdAt: string;
  joined: boolean;
  joinedAt: string | null;
}

export interface ReferralsReportDto {
  year: number;
  month: number;
  kpis: { leads: number; joined: number; coins: number; bonus: number; referrers: number };
  byMonth: Array<{ month: string; leads: number; joined: number }>;
  rows: ReferrerRowDto[];
  referred: ReferredRowDto[];
}

export function newReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** The student's invite code, made on first use. */
export async function ensureReferralCode(db: DbClient, studentId: string): Promise<string> {
  const student = await db.student.findUniqueOrThrow({
    where: { id: studentId },
    select: { referralCode: true },
  });
  if (student.referralCode) return student.referralCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newReferralCode();
    try {
      await db.student.update({ where: { id: studentId }, data: { referralCode: code } });
      return code;
    } catch (error) {
      if (prismaCode(error) !== "P2002") throw error;
    }
  }
  throw new Error("could not make a referral code");
}

/** The "invite a friend" card on the student's page. */
export async function getPortalReferral(
  token: string,
  locale: string,
  db: DbClient = prisma,
): Promise<PortalReferralDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const organizationId = await organizationOfBranch(db, membership.group.branchId);
  const [code, form, origin, joined] = await Promise.all([
    ensureReferralCode(db, membership.studentId),
    db.leadForm.findFirst({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { slug: true },
    }),
    appOriginFor(organizationId, db),
    db.student.count({
      where: { referredById: membership.studentId, referralCreditedAt: { not: null } },
    }),
  ]);
  return {
    code,
    link: form ? `${origin}/${locale}/forms/${form.slug}?ref=${code}` : null,
    joined,
  };
}

/** The student behind an invite code, when it is one of the centre's and still active. */
export async function studentByReferralCode(
  db: DbClient,
  organizationId: string,
  code: string,
): Promise<{ id: string; fullName: string } | null> {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(normalised)) return null;
  return db.student.findFirst({
    where: { referralCode: normalised, isArchived: false, branch: { organizationId } },
    select: { id: true, fullName: true },
  });
}

/** The centre's lead source that stands for "a friend", when it has one. */
export async function referralSourceId(
  db: DbClient,
  organizationId: string,
): Promise<string | null> {
  const sources = await db.leadSource.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  return (
    sources.find((s) => /referr|tavsiya|do[‘'ʻ`]?st|friend|друг|рефер/i.test(s.name))?.id ?? null
  );
}

/**
 * A referrer picked by staff must be a student of the same centre and not the
 * person being referred. `field` names the form field the error lands on.
 */
export async function assertReferrer(
  db: DbClient,
  organizationId: string,
  referrerId: string,
  field: "referrerId" | "referredById",
  selfId?: string | null,
): Promise<void> {
  if (selfId && referrerId === selfId) {
    throw AppError.validation({ [field]: ["validation.referralSelf"] });
  }
  const found = await db.student.findFirst({
    where: { id: referrerId, branch: { organizationId } },
    select: { id: true },
  });
  if (!found) throw AppError.validation({ [field]: ["validation.referralUnknown"] });
}

/**
 * Credits the referrer of a student once that student has a current membership:
 * coins through the REFERRAL rule (when automatic coins are on) and, when the
 * centre set a bonus, a bonus-only payment on the referrer's current membership.
 * Runs inside the caller's transaction; a second call changes nothing.
 */
export async function creditReferral(
  tx: DbClient,
  referredStudentId: string,
  actor: Actor | null,
): Promise<boolean> {
  const student = await tx.student.findUnique({
    where: { id: referredStudentId },
    select: {
      id: true,
      fullName: true,
      referredById: true,
      referralCreditedAt: true,
      branch: { select: { organizationId: true } },
      memberships: { where: { status: { in: [...CURRENT] } }, select: { id: true }, take: 1 },
    },
  });
  if (!student?.referredById || student.referralCreditedAt || student.memberships.length === 0) {
    return false;
  }
  const referrer = await tx.student.findUnique({
    where: { id: student.referredById },
    select: {
      id: true,
      memberships: {
        where: { status: { in: [...CURRENT] }, group: { status: { not: "ARCHIVED" } } },
        orderBy: { joinedAt: "asc" },
        take: 1,
        select: { id: true, groupId: true, group: { select: { branchId: true } } },
      },
    },
  });
  if (!referrer) return false;
  const organizationId = student.branch.organizationId;
  await tx.student.update({
    where: { id: student.id },
    data: { referralCreditedAt: new Date() },
  });
  const membership = referrer.memberships[0] ?? null;
  await awardAutoCoins(tx, {
    event: "REFERRAL",
    studentId: referrer.id,
    groupId: membership?.groupId ?? null,
    refKey: `referral:${student.id}`,
  });
  const settings = await tx.orgSettings.findUnique({
    where: { organizationId },
    select: { referralBonus: true },
  });
  let bonus = 0;
  if (settings && settings.referralBonus > 0 && membership) {
    bonus = settings.referralBonus;
    const balance = (await membershipBalances(tx, [membership.id])).get(membership.id);
    await tx.payment.create({
      data: {
        studentId: referrer.id,
        membershipId: membership.id,
        branchId: membership.group.branchId,
        amount: 0,
        bonus,
        effectiveMonth: isoToDate(balance?.suggestedMonth ?? `${today().slice(0, 7)}-01`),
        paidAt: isoToDate(today()),
        comment: `Referral: ${student.fullName}`,
        receivedById: actor?.userId || null,
        referralOfId: student.id,
      },
    });
  }
  await recordAudit(tx, actor, {
    action: "referral.credit",
    entity: "Student",
    entityId: referrer.id,
    after: { referredStudentId: student.id, referredName: student.fullName, bonus },
    branchId: membership?.group.branchId ?? null,
    organizationId,
  });
  return true;
}

/** Reports → Referral programme: who invited whom this month, and what it earned them. */
export async function getReferralsReport(
  actor: Actor,
  filters: ReferralsReportFilters,
  db: DbClient = prisma,
): Promise<ReferralsReportDto> {
  authorize(actor, "reports.leads");
  const scope = reportBranch(actor, filters.branchId);
  const period = monthPeriod(filters.year, filters.month);
  const range = { gte: period.from, lte: new Date(period.to.getTime() + 86_400_000 - 1) };
  const yearRange = {
    gte: new Date(Date.UTC(period.year, 0, 1)),
    lt: new Date(Date.UTC(period.year + 1, 0, 1)),
  };
  const [leads, credited, yearLeads, yearCredited, coins, bonuses] = await Promise.all([
    db.lead.findMany({
      where: { ...branchIn(scope), referrerId: { not: null }, createdAt: range },
      select: {
        id: true,
        fullName: true,
        createdAt: true,
        studentId: true,
        referrerId: true,
        referrer: { select: { fullName: true } },
        phones: { orderBy: { sortOrder: "asc" }, take: 1, select: { phone: true } },
        student: { select: { referralCreditedAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.student.findMany({
      where: { ...branchIn(scope), referredById: { not: null }, referralCreditedAt: range },
      select: {
        id: true,
        fullName: true,
        phone: true,
        createdAt: true,
        referralCreditedAt: true,
        referredById: true,
        referredBy: { select: { fullName: true } },
        leads: { where: { referrerId: { not: null } }, select: { id: true }, take: 1 },
      },
      orderBy: { referralCreditedAt: "desc" },
    }),
    db.lead.findMany({
      where: { ...branchIn(scope), referrerId: { not: null }, createdAt: yearRange },
      select: { createdAt: true },
    }),
    db.student.findMany({
      where: { ...branchIn(scope), referralCreditedAt: yearRange },
      select: { referralCreditedAt: true },
    }),
    db.coinTransaction.findMany({
      where: { event: "REFERRAL", createdAt: range, student: branchIn(scope) },
      select: { studentId: true, amount: true },
    }),
    db.payment.findMany({
      where: { ...branchIn(scope), referralOfId: { not: null }, createdAt: range },
      select: { studentId: true, bonus: true },
    }),
  ]);

  const rows = new Map<string, ReferrerRowDto>();
  const row = (studentId: string, fullName: string) => {
    let r = rows.get(studentId);
    if (!r) {
      r = { studentId, fullName, leads: 0, joined: 0, coins: 0, bonus: 0 };
      rows.set(studentId, r);
    }
    return r;
  };
  for (const l of leads) row(l.referrerId!, l.referrer?.fullName ?? "").leads += 1;
  for (const s of credited) row(s.referredById!, s.referredBy?.fullName ?? "").joined += 1;
  const named = new Set(rows.keys());
  for (const c of coins) if (named.has(c.studentId)) rows.get(c.studentId)!.coins += c.amount;
  for (const b of bonuses) if (named.has(b.studentId)) rows.get(b.studentId)!.bonus += num(b.bonus);

  const months = monthsOfYear(period.year);
  const byMonth = months.map((month) => ({
    month,
    leads: yearLeads.filter((l) => monthKey(l.createdAt) === month).length,
    joined: yearCredited.filter((s) => monthKey(s.referralCreditedAt!) === month).length,
  }));

  const referred: ReferredRowDto[] = [
    ...credited.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      phone: s.phone,
      referrerName: s.referredBy?.fullName ?? "",
      createdAt: s.createdAt.toISOString(),
      joined: true,
      joinedAt: s.referralCreditedAt ? dateToIso(s.referralCreditedAt) : null,
    })),
    // Leads of the month still waiting: those already credited are listed above.
    ...leads
      .filter((l) => !l.student?.referralCreditedAt)
      .map((l) => ({
        id: l.id,
        fullName: l.fullName,
        phone: l.phones[0]?.phone ?? null,
        referrerName: l.referrer?.fullName ?? "",
        createdAt: l.createdAt.toISOString(),
        joined: false,
        joinedAt: null,
      })),
  ];

  const list = [...rows.values()].sort(
    (a, b) => b.joined - a.joined || b.leads - a.leads || a.fullName.localeCompare(b.fullName),
  );
  return {
    year: period.year,
    month: period.month,
    kpis: {
      leads: leads.length,
      joined: credited.length,
      coins: list.reduce((sum, r) => sum + r.coins, 0),
      bonus: list.reduce((sum, r) => sum + r.bonus, 0),
      referrers: list.length,
    },
    byMonth,
    rows: list,
    referred,
  };
}
