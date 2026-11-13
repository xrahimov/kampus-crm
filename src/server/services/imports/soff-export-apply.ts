import { randomBytes, randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/server/auth/password";
import { prisma, type DbClient } from "@/server/db/prisma";
import { syncLessons } from "@/server/services/groups/groups.service";
import { dateToIso, decimalToNumber, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import { monthStart } from "@/server/services/students/fees";

import { matchSnapshot, nameKey, type MatchResult } from "./soff-export-match";
import type { SnapGroup, SnapMembership, SoffSnapshot } from "./soff-export-normalize";

/*
 * Writes a snapshot of a centre's SOFF CRM into one Kampus organisation (A-189).
 *
 * - Everything happens in one transaction: it all lands or nothing does. A dry run
 *   is the same run rolled back at the end, so its counts are the real ones.
 * - Records are written straight to the database. Nothing here sends an SMS or a
 *   Telegram message, gives coins or notifies anyone.
 * - Every copied record is remembered in ImportRef, and records the centre already
 *   has (from an earlier copy or typed in by hand) are matched first, so the run
 *   can be repeated: it adds what is new and brings the rest up to date.
 * - The old system is the truth for what it holds. Kampus records it does not know
 *   are left alone and counted in the report.
 */

const SOURCE = "soff";

export interface ApplyOptions {
  organizationId: string;
  dryRun: boolean;
  log?: (line: string) => void;
}

export interface KindCount {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  removed: number;
}

export interface BranchMoney {
  branch: string;
  /** What the old system shows. */
  expected: { owing: number; owingTotal: number; credit: number; creditTotal: number };
  /** What Kampus shows after the copy, by its own balance engine. */
  kampus: { owing: number; owingTotal: number; credit: number; creditTotal: number };
}

export interface ApplyReport {
  dryRun: boolean;
  organization: string;
  exportedAt: string;
  counts: Record<string, KindCount>;
  /** Students matched to a record the centre already had, by how they were found. */
  studentMatches: MatchResult["studentsBy"];
  /** Groups matched to a group the centre already had, by how they were found. */
  groupMatches: MatchResult["groupsBy"];
  /** Roles of the new staff accounts that can sign in (archived ones cannot), e.g. { TEACHER: 2 }. */
  newStaffRoles: Record<string, number>;
  /** Records in Kampus that the old system does not have; left as they are. */
  kampusOnly: { students: number; groups: number; memberships: number; staff: number };
  money: BranchMoney[];
  notes: string[];
}

class DryRunRollback extends Error {}

function emptyCount(): KindCount {
  return { created: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0 };
}

function chunks<T>(rows: T[], size = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function sameDay(a: Date | null, b: string | null): boolean {
  return (a ? dateToIso(a) : null) === b;
}

function sameMoney(a: { toString(): string } | null, b: number | null): boolean {
  if (a === null || b === null) return a === null && b === null;
  return Math.abs(decimalToNumber(a) - b) < 0.005;
}

/** Which old record became which Kampus record. */
class Refs {
  private readonly byKind = new Map<string, Map<string, string>>();
  private readonly fresh: Array<{ kind: string; externalId: string; entityId: string }> = [];
  private readonly dropped: Array<{ kind: string; externalId: string }> = [];

  constructor(rows: Array<{ kind: string; externalId: string; entityId: string }>) {
    for (const row of rows) this.kind(row.kind).set(row.externalId, row.entityId);
  }

  private kind(kind: string): Map<string, string> {
    let map = this.byKind.get(kind);
    if (!map) {
      map = new Map();
      this.byKind.set(kind, map);
    }
    return map;
  }

  get(kind: string, ext: string): string | undefined {
    return this.kind(kind).get(ext);
  }

  entries(kind: string): Array<[string, string]> {
    return [...this.kind(kind).entries()];
  }

  set(kind: string, ext: string, entityId: string): void {
    const known = this.kind(kind).get(ext);
    if (known === entityId) return;
    if (known !== undefined) this.dropped.push({ kind, externalId: ext });
    this.kind(kind).set(ext, entityId);
    this.fresh.push({ kind, externalId: ext, entityId });
  }

  drop(kind: string, ext: string): void {
    if (this.kind(kind).delete(ext)) this.dropped.push({ kind, externalId: ext });
  }

  async flush(tx: DbClient, organizationId: string): Promise<void> {
    const byKind = new Map<string, string[]>();
    for (const d of this.dropped) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d.externalId]);
    for (const [kind, exts] of byKind) {
      for (const part of chunks(exts)) {
        await tx.importRef.deleteMany({
          where: { organizationId, source: SOURCE, kind, externalId: { in: part } },
        });
      }
    }
    // The last entity set for an old id wins.
    const last = new Map<string, { kind: string; externalId: string; entityId: string }>();
    for (const f of this.fresh) last.set(`${f.kind}|${f.externalId}`, f);
    const live = [...last.values()].filter((f) => this.get(f.kind, f.externalId) === f.entityId);
    for (const part of chunks(live)) {
      await tx.importRef.createMany({
        data: part.map((f) => ({ organizationId, source: SOURCE, ...f })),
      });
    }
  }
}

const ROLE_CODES: Record<string, string> = {
  teacher: "TEACHER",
  support: "SUPPORT_TEACHER",
  "support teacher": "SUPPORT_TEACHER",
  admin: "ADMIN",
  administrator: "ADMIN",
  marketolog: "MARKETER",
  marketer: "MARKETER",
  "branch manager": "BRANCH_MANAGER",
  cashier: "CASHIER",
  kassir: "CASHIER",
};

function patternOf(weekdays: number[]): "EVEN" | "ODD" | "EVERY_DAY" | "CUSTOM" {
  const key = [...weekdays].sort((a, b) => a - b).join(",");
  if (key === "1,3,5") return "ODD";
  if (key === "2,4,6") return "EVEN";
  if (key === "1,2,3,4,5,6") return "EVERY_DAY";
  return "CUSTOM";
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a "YYYY-MM-DD" day. */
function weekdayOf(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function moneyTotals(perStudent: Iterable<number>) {
  const totals = { owing: 0, owingTotal: 0, credit: 0, creditTotal: 0 };
  for (const value of perStudent) {
    if (value < -0.5) {
      totals.owing += 1;
      totals.owingTotal += value;
    } else if (value > 0.5) {
      totals.credit += 1;
      totals.creditTotal += value;
    }
  }
  totals.owingTotal = Math.round(totals.owingTotal);
  totals.creditTotal = Math.round(totals.creditTotal);
  return totals;
}

/**
 * Copies the snapshot into the organisation. With `dryRun` nothing stays written;
 * the report is what the real run would do.
 */
export async function applySoffSnapshot(
  snapshot: SoffSnapshot,
  options: ApplyOptions,
  db: PrismaClient = prisma,
): Promise<ApplyReport> {
  const report: ApplyReport = {
    dryRun: options.dryRun,
    organization: "",
    exportedAt: snapshot.exportedAt,
    counts: {},
    studentMatches: { ref: 0, phoneAndName: 0, phone: 0, name: 0, twin: 0 },
    groupMatches: { ref: 0, members: 0, name: 0, earlierName: 0 },
    newStaffRoles: {},
    kampusOnly: { students: 0, groups: 0, memberships: 0, staff: 0 },
    money: [],
    notes: [...snapshot.warnings],
  };
  try {
    await db.$transaction(
      async (tx) => {
        await run(tx, snapshot, options, report);
        if (options.dryRun) throw new DryRunRollback();
      },
      { timeout: 30 * 60_000, maxWait: 60_000 },
    );
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
  return report;
}

async function run(
  tx: DbClient,
  snapshot: SoffSnapshot,
  options: ApplyOptions,
  report: ApplyReport,
): Promise<void> {
  const log = options.log ?? (() => {});
  const { organizationId } = options;
  const count = (kind: string): KindCount => (report.counts[kind] ??= emptyCount());
  const note = (text: string) => {
    if (!report.notes.includes(text)) report.notes.push(text);
  };
  const exportDay = isoToDate(snapshot.exportedAt);

  const organization = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, name: true },
  });
  if (!organization) throw new Error("The organisation does not exist");
  report.organization = organization.name;

  const refs = new Refs(
    await tx.importRef.findMany({
      where: { organizationId, source: SOURCE },
      select: { kind: true, externalId: true, entityId: true },
    }),
  );

  // --- Branches: they must exist already, by name --------------------------------
  const orgBranches = await tx.branch.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  const branchId = new Map<string, string>();
  for (const b of snapshot.branches) {
    const match = orgBranches.find((x) => nameKey(x.name) === nameKey(b.name));
    if (!match) throw new Error(`The organisation has no branch named "${b.name}"`);
    branchId.set(b.ext, match.id);
  }
  const branchIds = [...new Set(branchId.values())];
  const branchOf = (ext: string): string => {
    const id = branchId.get(ext);
    if (!id) throw new Error(`Unknown branch ${ext} in the snapshot`);
    return id;
  };

  // --- Small catalogues -----------------------------------------------------------
  log("catalogues");
  const methods = await tx.paymentMethod.findMany({
    where: { organizationId },
    select: { id: true, name: true, sortOrder: true },
  });
  const methodId = new Map(methods.map((m) => [nameKey(m.name), m.id]));
  let methodOrder = methods.reduce((max, m) => Math.max(max, m.sortOrder), 0);
  for (const name of snapshot.paymentMethods) {
    if (methodId.has(nameKey(name))) {
      count("paymentMethods").unchanged += 1;
      continue;
    }
    methodOrder += 1;
    const created = await tx.paymentMethod.create({
      data: { organizationId, name, isCash: /naqd|cash|налич/i.test(name), sortOrder: methodOrder },
      select: { id: true },
    });
    methodId.set(nameKey(name), created.id);
    count("paymentMethods").created += 1;
  }

  const reasons = await tx.leaveReason.findMany({
    where: { organizationId, kind: "LEAVE" },
    select: { name: true },
  });
  const reasonNames = new Set(reasons.map((r) => nameKey(r.name)));
  for (const name of snapshot.leaveReasons) {
    if (reasonNames.has(nameKey(name))) {
      count("leaveReasons").unchanged += 1;
      continue;
    }
    await tx.leaveReason.create({ data: { organizationId, name, kind: "LEAVE" } });
    reasonNames.add(nameKey(name));
    count("leaveReasons").created += 1;
  }

  const sources = await tx.leadSource.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  const sourceId = new Map(sources.map((s) => [nameKey(s.name), s.id]));
  for (const name of snapshot.leadSources) {
    if (sourceId.has(nameKey(name))) {
      count("leadSources").unchanged += 1;
      continue;
    }
    const created = await tx.leadSource.create({
      data: { organizationId, name },
      select: { id: true },
    });
    sourceId.set(nameKey(name), created.id);
    count("leadSources").created += 1;
  }

  // --- Staff -----------------------------------------------------------------------
  log("staff");
  const orgUsers = await tx.user.findMany({
    where: { organizationId },
    select: { id: true, phone: true, fullName: true, isArchived: true },
  });
  const userById = new Map(orgUsers.map((u) => [u.id, u]));
  const userByPhone = new Map(orgUsers.map((u) => [u.phone, u]));
  const roleRows = await tx.role.findMany({
    where: { organizationId: null, isSystem: true },
    select: { id: true, code: true },
  });
  const roleId = new Map(roleRows.map((r) => [r.code, r.id]));
  const staffId = new Map<string, string>();
  const matchedUsers = new Set<string>();
  let staffArchivedThere = 0;
  for (const s of snapshot.staff) {
    const byRef = refs.get("staff", s.ext);
    let user = byRef ? userById.get(byRef) : undefined;
    if (!user && s.phone) user = userByPhone.get(s.phone);
    if (user) {
      staffId.set(s.ext, user.id);
      refs.set("staff", s.ext, user.id);
      matchedUsers.add(user.id);
      if (s.archived && !user.isArchived) staffArchivedThere += 1;
      count("staff").unchanged += 1;
      continue;
    }
    if (!s.phone) {
      count("staff").skipped += 1;
      note("A staff member without a phone number was left out");
      continue;
    }
    const taken = await tx.user.findUnique({ where: { phone: s.phone }, select: { id: true } });
    if (taken) {
      // The number signs in to another centre on this server: one person, one account.
      count("staff").skipped += 1;
      note(
        "A staff member's phone number already belongs to an account of another centre; that person was left out",
      );
      continue;
    }
    const roleCodes = s.roles.map((r) => ROLE_CODES[r]).filter((code): code is string => !!code);
    if (roleCodes.length === 0 && s.roles.length > 0 && !s.archived) {
      note(
        "A new staff member holds only a role that is never given automatically (such as CEO); the account was made without a role",
      );
    }
    const created = await tx.user.create({
      data: {
        organizationId,
        fullName: s.fullName,
        phone: s.phone,
        // Nobody knows this password; staff sign in with Telegram or get one from the CEO.
        passwordHash: await hashPassword(randomBytes(24).toString("base64url")),
        mustChangePassword: true,
        gender: s.gender,
        birthDate: s.birthDate ? isoToDate(s.birthDate) : null,
        hireDate: s.hireDate ? isoToDate(s.hireDate) : null,
        isArchived: s.archived,
        salaryMethod: s.salary?.method ?? null,
        fixedSalary: s.salary?.method === "MONTHLY" ? s.salary.value : null,
        percentShare:
          s.salary?.method === "PERCENT" ? Math.min(100, Math.max(0, s.salary.value)) : null,
        perLessonFee: s.salary?.method === "PER_LESSON" ? s.salary.value : null,
        perStudentFee: s.salary?.method === "PER_STUDENT" ? s.salary.value : null,
        roles: {
          create: [...new Set(roleCodes)]
            .map((code) => roleId.get(code))
            .filter((id): id is string => !!id)
            .map((id) => ({ roleId: id })),
        },
        branches: {
          create: [...new Set(s.branchExts.map(branchOf))].map((id) => ({ branchId: id })),
        },
      },
      select: { id: true, phone: true, fullName: true, isArchived: true },
    });
    userById.set(created.id, created);
    userByPhone.set(created.phone, created);
    staffId.set(s.ext, created.id);
    refs.set("staff", s.ext, created.id);
    matchedUsers.add(created.id);
    count("staff").created += 1;
    if (!s.archived) {
      for (const code of roleCodes.length ? new Set(roleCodes) : ["(no role)"]) {
        report.newStaffRoles[code] = (report.newStaffRoles[code] ?? 0) + 1;
      }
    }
  }
  if (staffArchivedThere > 0) {
    note(
      `${staffArchivedThere} staff are archived in the old system but still active in Kampus; their accounts were not touched`,
    );
  }
  report.kampusOnly.staff = orgUsers.filter((u) => !matchedUsers.has(u.id)).length;
  const userByName = new Map<string, string>();
  for (const s of snapshot.staff) {
    const id = staffId.get(s.ext);
    if (id && !userByName.has(nameKey(s.fullName))) userByName.set(nameKey(s.fullName), id);
  }

  // --- Courses ---------------------------------------------------------------------
  log("courses and rooms");
  const orgCourses = await tx.course.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true, branchId: true, name: true, price: true, durationMonths: true },
    orderBy: [{ isArchived: "asc" }, { createdAt: "asc" }],
  });
  const courseById = new Map(orgCourses.map((c) => [c.id, c]));
  const courseId = new Map<string, string>();
  for (const c of snapshot.courses) {
    const home = branchOf(c.branchExt);
    const byRef = refs.get("course", c.ext);
    const existing =
      (byRef ? courseById.get(byRef) : undefined) ??
      orgCourses.find((x) => x.branchId === home && nameKey(x.name) === nameKey(c.name));
    if (existing) {
      courseId.set(c.ext, existing.id);
      refs.set("course", c.ext, existing.id);
      if (!sameMoney(existing.price, c.price) || existing.durationMonths !== c.durationMonths) {
        await tx.course.update({
          where: { id: existing.id },
          data: { price: c.price, durationMonths: c.durationMonths },
        });
        count("courses").updated += 1;
      } else {
        count("courses").unchanged += 1;
      }
      continue;
    }
    const created = await tx.course.create({
      data: {
        branchId: home,
        name: c.name,
        description: c.description,
        price: c.price,
        durationMonths: c.durationMonths,
        color: c.color,
      },
      select: { id: true, branchId: true, name: true, price: true, durationMonths: true },
    });
    orgCourses.push(created);
    courseById.set(created.id, created);
    courseId.set(c.ext, created.id);
    refs.set("course", c.ext, created.id);
    count("courses").created += 1;
  }

  // --- Rooms -----------------------------------------------------------------------
  const orgRooms = await tx.room.findMany({
    where: { branchId: { in: branchIds } },
    select: { id: true, branchId: true, name: true },
  });
  const roomIds = new Set(orgRooms.map((r) => r.id));
  const roomId = new Map<string, string>();
  for (const r of snapshot.rooms) {
    const home = branchOf(r.branchExt);
    const byRef = refs.get("room", r.ext);
    const existing =
      (byRef && roomIds.has(byRef) ? byRef : undefined) ??
      orgRooms.find((x) => x.branchId === home && nameKey(x.name) === nameKey(r.name))?.id;
    if (existing) {
      roomId.set(r.ext, existing);
      refs.set("room", r.ext, existing);
      count("rooms").unchanged += 1;
      continue;
    }
    const created = await tx.room.create({
      data: { branchId: home, name: r.name, capacity: r.capacity },
      select: { id: true, branchId: true, name: true },
    });
    orgRooms.push(created);
    roomIds.add(created.id);
    roomId.set(r.ext, created.id);
    refs.set("room", r.ext, created.id);
    count("rooms").created += 1;
  }

  // --- What the centre already has, and which record of the old system each one is ----
  log("matching");
  const orgGroups = await tx.group.findMany({
    where: { branchId: { in: branchIds } },
    select: {
      id: true,
      branchId: true,
      name: true,
      courseId: true,
      status: true,
      startDate: true,
      endDate: true,
      weekdayPattern: true,
      finishedAt: true,
      slots: { select: { weekday: true, startTime: true, endTime: true, roomId: true } },
      teachers: { select: { userId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  type GroupRow = (typeof orgGroups)[number];
  const orgStudents = await tx.student.findMany({
    where: { branchId: { in: branchIds } },
    select: {
      id: true,
      branchId: true,
      fullName: true,
      phone: true,
      gender: true,
      birthDate: true,
      isArchived: true,
      parents: { select: { phone: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  type StudentRow = (typeof orgStudents)[number];
  const haveMemberships = await tx.groupMembership.findMany({
    where: { groupId: { in: orgGroups.map((g) => g.id) } },
    select: {
      id: true,
      groupId: true,
      studentId: true,
      status: true,
      joinedAt: true,
      leftAt: true,
      customPrice: true,
      billingFrom: true,
      frozenAt: true,
      activatedAt: true,
      leaveReason: true,
      note: true,
    },
  });
  const extOfBranch = new Map([...branchId].map(([ext, id]) => [id, ext]));
  const matched = matchSnapshot({
    snapshot,
    students: orgStudents.map((x) => ({
      id: x.id,
      branchExt: extOfBranch.get(x.branchId) ?? "",
      fullName: x.fullName,
      phone: x.phone,
    })),
    groups: orgGroups.map((x) => ({
      id: x.id,
      branchExt: extOfBranch.get(x.branchId) ?? "",
      name: x.name,
    })),
    members: haveMemberships.map((m) => ({ groupId: m.groupId, studentId: m.studentId })),
    studentRefs: new Map(refs.entries("student")),
    groupRefs: new Map(refs.entries("group")),
  });
  report.studentMatches = matched.studentsBy;
  report.groupMatches = matched.groupsBy;
  const groupRowById = new Map(orgGroups.map((g) => [g.id, g]));
  const studentRowById = new Map(orgStudents.map((x) => [x.id, x]));
  const groupMatch = new Map<string, GroupRow>();
  for (const [ext, id] of matched.groups) {
    const row = groupRowById.get(id);
    if (row) groupMatch.set(ext, row);
  }
  const studentMatch = new Map<string, StudentRow>();
  for (const [ext, id] of matched.students) {
    const row = studentRowById.get(id);
    if (row) studentMatch.set(ext, row);
  }
  const claimedGroups = new Set(matched.groups.values());
  const claimedStudents = new Set(matched.students.values());
  report.kampusOnly.groups = orgGroups.filter((g) => !claimedGroups.has(g.id)).length;
  report.kampusOnly.students = orgStudents.filter((x) => !claimedStudents.has(x.id)).length;

  // --- Students --------------------------------------------------------------------
  log("students");
  const studentId = new Map<string, string>();
  const newStudents: Prisma.StudentCreateManyInput[] = [];
  const newParents: Prisma.ParentCreateManyInput[] = [];
  for (const s of snapshot.students) {
    const home = branchOf(s.branchExt);
    const existing = studentMatch.get(s.ext);
    let id: string;
    const haveParents = new Set<string>();
    if (existing) {
      id = existing.id;
      for (const p of existing.parents) haveParents.add(p.phone);
      const changed =
        existing.fullName !== s.fullName ||
        existing.phone !== s.phone ||
        existing.isArchived !== s.archived ||
        (existing.birthDate === null && s.birthDate !== null);
      if (changed) {
        await tx.student.update({
          where: { id },
          data: {
            fullName: s.fullName,
            phone: s.phone,
            isArchived: s.archived,
            ...(existing.birthDate === null && s.birthDate
              ? { birthDate: isoToDate(s.birthDate), gender: s.gender }
              : {}),
          },
        });
        count("students").updated += 1;
      } else {
        count("students").unchanged += 1;
      }
    } else {
      id = randomUUID();
      newStudents.push({
        id,
        branchId: home,
        fullName: s.fullName,
        phone: s.phone,
        gender: s.gender,
        birthDate: s.birthDate ? isoToDate(s.birthDate) : null,
        isArchived: s.archived,
        ...(s.createdAt ? { createdAt: new Date(s.createdAt) } : {}),
      });
      count("students").created += 1;
    }
    studentId.set(s.ext, id);
    refs.set("student", s.ext, id);
    for (const p of s.parents) {
      if (haveParents.has(p.phone)) {
        count("parents").unchanged += 1;
        continue;
      }
      haveParents.add(p.phone);
      newParents.push({ studentId: id, fullName: p.fullName, phone: p.phone });
      count("parents").created += 1;
    }
  }
  for (const part of chunks(newStudents)) await tx.student.createMany({ data: part });
  for (const part of chunks(newParents)) await tx.parent.createMany({ data: part });

  // Comments: the old system's own timestamp tells one from the next.
  const snapshotStudentIds = [...new Set(studentId.values())];
  const haveComments = new Set<string>();
  for (const part of chunks(snapshotStudentIds)) {
    const rows = await tx.studentComment.findMany({
      where: { studentId: { in: part } },
      select: { studentId: true, text: true, createdAt: true },
    });
    for (const c of rows) haveComments.add(`${c.studentId}|${c.createdAt.getTime()}|${c.text}`);
  }
  const newComments: Prisma.StudentCommentCreateManyInput[] = [];
  for (const s of snapshot.students) {
    const id = studentId.get(s.ext)!;
    for (const c of s.comments) {
      const createdAt = c.createdAt ? new Date(c.createdAt) : exportDay;
      const author = c.author ? userByName.get(nameKey(c.author)) : undefined;
      const text = author || !c.author ? c.text : `${c.text} (${c.author})`;
      const key = `${id}|${createdAt.getTime()}|${text}`;
      if (haveComments.has(key)) {
        count("comments").unchanged += 1;
        continue;
      }
      haveComments.add(key);
      newComments.push({ studentId: id, text, createdAt, createdById: author ?? null });
      count("comments").created += 1;
    }
  }
  for (const part of chunks(newComments)) await tx.studentComment.createMany({ data: part });

  // --- Groups ----------------------------------------------------------------------
  log("groups");
  const groupId = new Map<string, string>();
  const groupSlots = new Map<string, SnapGroup["slots"]>();
  for (const g of snapshot.groups) {
    const home = branchOf(g.branchExt);
    const course = courseId.get(g.courseExt);
    if (!course) {
      count("groups").skipped += 1;
      continue;
    }
    const slots = g.slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      roomId: s.roomExt ? (roomId.get(s.roomExt) ?? null) : null,
    }));
    const teachers = g.teachers
      .map((t) => ({ ...t, userId: staffId.get(t.staffExt) }))
      .filter((t): t is typeof t & { userId: string } => !!t.userId);
    const pattern = patternOf(slots.map((s) => s.weekday));
    const finishedAt = g.status === "ARCHIVED" ? exportDay : null;
    const existing = groupMatch.get(g.ext);
    let id: string;
    let resync = false;
    if (!existing) {
      const created = await tx.group.create({
        data: {
          branchId: home,
          name: g.name,
          courseId: course,
          weekdayPattern: pattern,
          startDate: isoToDate(g.startDate),
          endDate: isoToDate(g.endDate),
          status: g.status,
          finishedAt,
          slots: { create: slots },
          teachers: {
            create: teachers.map((t) => ({
              userId: t.userId,
              role: "MAIN" as const,
              shareType: t.shareType,
              shareValue: t.shareValue,
              since: isoToDate(t.since),
            })),
          },
        },
        select: { id: true },
      });
      id = created.id;
      resync = g.status !== "ARCHIVED";
      count("groups").created += 1;
    } else {
      id = existing.id;
      const slotKey = (rows: typeof slots) =>
        [...rows]
          .sort((a, b) => a.weekday - b.weekday)
          .map((s) => `${s.weekday}|${s.startTime}|${s.endTime}|${s.roomId ?? ""}`)
          .join(";");
      const slotsChanged = slotKey(existing.slots) !== slotKey(slots);
      const datesChanged =
        !sameDay(existing.startDate, g.startDate) || !sameDay(existing.endDate, g.endDate);
      const fieldsChanged =
        existing.name !== g.name ||
        existing.courseId !== course ||
        existing.status !== g.status ||
        existing.weekdayPattern !== pattern ||
        datesChanged;
      const haveTeachers = new Set(existing.teachers.map((t) => t.userId));
      const wantTeachers = new Set(teachers.map((t) => t.userId));
      const teachersChanged =
        teachers.length > 0 &&
        (haveTeachers.size !== wantTeachers.size ||
          [...wantTeachers].some((userId) => !haveTeachers.has(userId)));
      if (fieldsChanged) {
        await tx.group.update({
          where: { id },
          data: {
            name: g.name,
            courseId: course,
            status: g.status,
            weekdayPattern: pattern,
            startDate: isoToDate(g.startDate),
            endDate: isoToDate(g.endDate),
            finishedAt: g.status === "ARCHIVED" ? (existing.finishedAt ?? exportDay) : null,
          },
        });
      }
      if (slotsChanged) {
        await tx.groupScheduleSlot.deleteMany({ where: { groupId: id } });
        if (slots.length) {
          await tx.groupScheduleSlot.createMany({
            data: slots.map((s) => ({ ...s, groupId: id })),
          });
        }
      }
      if (teachersChanged) {
        await tx.groupTeacher.deleteMany({
          where: { groupId: id, userId: { notIn: [...wantTeachers] } },
        });
        for (const t of teachers) {
          if (haveTeachers.has(t.userId)) continue;
          await tx.groupTeacher.create({
            data: {
              groupId: id,
              userId: t.userId,
              role: "MAIN",
              shareType: t.shareType,
              shareValue: t.shareValue,
              since: isoToDate(t.since),
            },
          });
        }
      }
      resync = g.status !== "ARCHIVED" && (slotsChanged || datesChanged);
      if (fieldsChanged || slotsChanged || teachersChanged) count("groups").updated += 1;
      else count("groups").unchanged += 1;
    }
    if (resync && slots.length > 0) {
      await syncLessons(
        tx,
        { id, branchId: home, startDate: isoToDate(g.startDate), endDate: isoToDate(g.endDate) },
        slots,
      );
    }
    groupId.set(g.ext, id);
    groupSlots.set(g.ext, g.slots);
    refs.set("group", g.ext, id);
  }

  // --- Memberships, balances -----------------------------------------------------------
  log("memberships and balances");
  const membershipByPair = new Map(haveMemberships.map((m) => [`${m.groupId}|${m.studentId}`, m]));
  const membershipId = new Map<string, string>();
  const touchedMemberships = new Set<string>();
  const newMemberships: Prisma.GroupMembershipCreateManyInput[] = [];
  /** Kampus charges before this month are inside the opening balance; null = no charge stays. */
  const chargeCut = new Map<string, string[]>();
  const membershipData = (m: SnapMembership) => {
    const charged = m.status !== "NEW";
    return {
      status: m.status,
      joinedAt: isoToDate(m.joinedAt),
      leftAt: m.leftAt ? isoToDate(m.leftAt) : null,
      customPrice: m.customPrice,
      billingFrom: m.billingFrom ? isoToDate(m.billingFrom) : null,
      frozenAt: m.frozenAt ? isoToDate(m.frozenAt) : null,
      activatedAt: charged ? isoToDate(m.joinedAt) : null,
      leaveReason: m.leaveReason,
      note: m.note,
    };
  };
  for (const m of snapshot.memberships) {
    const group = groupId.get(m.groupExt);
    const student = studentId.get(m.studentExt);
    if (!group || !student) {
      count("memberships").skipped += 1;
      continue;
    }
    const data = membershipData(m);
    const existing = membershipByPair.get(`${group}|${student}`);
    let id: string;
    if (existing) {
      id = existing.id;
      const changed =
        existing.status !== data.status ||
        !sameDay(existing.joinedAt, m.joinedAt) ||
        !sameDay(existing.leftAt, m.leftAt) ||
        !sameMoney(existing.customPrice, m.customPrice) ||
        !sameDay(existing.billingFrom, m.billingFrom) ||
        !sameDay(existing.frozenAt, m.frozenAt) ||
        !sameDay(existing.activatedAt, m.status === "NEW" ? null : m.joinedAt) ||
        existing.leaveReason !== data.leaveReason ||
        existing.note !== data.note;
      if (changed) {
        await tx.groupMembership.update({ where: { id }, data });
        count("memberships").updated += 1;
      } else {
        count("memberships").unchanged += 1;
      }
    } else {
      id = randomUUID();
      newMemberships.push({ id, groupId: group, studentId: student, ...data });
      count("memberships").created += 1;
    }
    membershipId.set(m.ext, id);
    touchedMemberships.add(id);
    refs.set("membership", m.ext, id);
    const gone = m.status === "ARCHIVED" || m.status === "GRADUATED" || m.status === "NEW";
    const cut = gone || !m.billingFrom ? "all" : monthStart(m.billingFrom);
    chargeCut.set(cut, [...(chargeCut.get(cut) ?? []), id]);
  }
  for (const part of chunks(newMemberships)) await tx.groupMembership.createMany({ data: part });
  for (const [cut, ids] of chargeCut) {
    for (const part of chunks(ids)) {
      const removed = await tx.charge.deleteMany({
        where: {
          membershipId: { in: part },
          ...(cut === "all" ? {} : { month: { lt: isoToDate(cut) } }),
        },
      });
      count("kampusCharges").removed += removed.count;
    }
  }
  const claimedGroupIds = new Set(groupId.values());
  report.kampusOnly.memberships = haveMemberships.filter(
    (m) => claimedGroupIds.has(m.groupId) && !touchedMemberships.has(m.id),
  ).length;

  // Opening balances: one row per membership, kept in step with the old balance.
  const openingIds = refs.entries("opening").map(([, id]) => id);
  const haveOpenings = new Map<
    string,
    { id: string; amount: Prisma.Decimal; membershipId: string }
  >();
  for (const part of chunks(openingIds)) {
    const rows = await tx.balanceAdjustment.findMany({
      where: { id: { in: part } },
      select: { id: true, amount: true, membershipId: true },
    });
    for (const row of rows) haveOpenings.set(row.id, row);
  }
  const membershipBranch = new Map<string, string>();
  for (const m of snapshot.memberships) {
    const group = snapshot.groups.find((g) => g.ext === m.groupExt);
    if (group) membershipBranch.set(m.ext, branchOf(group.branchExt));
  }
  const newOpenings: Prisma.BalanceAdjustmentCreateManyInput[] = [];
  for (const m of snapshot.memberships) {
    const id = membershipId.get(m.ext);
    const student = studentId.get(m.studentExt);
    if (!id || !student) continue;
    const refId = refs.get("opening", m.ext);
    const existing = refId ? haveOpenings.get(refId) : undefined;
    if (existing && existing.membershipId === id) {
      if (sameMoney(existing.amount, m.balance)) {
        count("openingBalances").unchanged += 1;
      } else {
        await tx.balanceAdjustment.update({
          where: { id: existing.id },
          data: { amount: m.balance, date: exportDay },
        });
        count("openingBalances").updated += 1;
      }
      continue;
    }
    if (Math.abs(m.balance) < 0.005) continue;
    const adjustmentId = randomUUID();
    newOpenings.push({
      id: adjustmentId,
      membershipId: id,
      studentId: student,
      branchId: membershipBranch.get(m.ext)!,
      amount: m.balance,
      kind: "OPENING",
      date: exportDay,
      comment: "Eski CRM (SOFF) dagi qoldiq",
    });
    refs.set("opening", m.ext, adjustmentId);
    count("openingBalances").created += 1;
  }
  for (const part of chunks(newOpenings)) await tx.balanceAdjustment.createMany({ data: part });

  // Money that Kampus itself holds on these memberships would be counted twice.
  const touched = [...touchedMemberships];
  let nativePayments = 0;
  let otherAdjustments = 0;
  const importAdjustmentIds = new Set(refs.entries("opening").map(([, id]) => id));
  for (const part of chunks(touched)) {
    nativePayments += await tx.payment.count({ where: { membershipId: { in: part } } });
    const rows = await tx.balanceAdjustment.findMany({
      where: { membershipId: { in: part } },
      select: { id: true },
    });
    otherAdjustments += rows.filter((r) => !importAdjustmentIds.has(r.id)).length;
  }
  if (nativePayments > 0) {
    note(
      `${nativePayments} payments were recorded in Kampus itself for these students; they count on top of the copied balances`,
    );
  }
  if (otherAdjustments > 0) {
    note(
      `${otherAdjustments} balance adjustments were made in Kampus itself for these students; they count on top of the copied balances`,
    );
  }

  // --- Payment history -------------------------------------------------------------
  log("payments");
  await syncByRef({
    tx,
    refs,
    kind: "payment",
    counter: count("payments"),
    rows: snapshot.payments.filter((p) => studentId.has(p.studentExt)),
    removeMissing: true,
    load: async (ids) =>
      (
        await tx.legacyPayment.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            studentId: true,
            amount: true,
            paidAt: true,
            method: true,
            comment: true,
            groupName: true,
          },
        })
      ).map((row) => ({
        id: row.id,
        key: [
          row.studentId,
          decimalToNumber(row.amount).toFixed(2),
          dateToIso(row.paidAt),
          row.method ?? "",
          row.comment ?? "",
          row.groupName ?? "",
        ].join("|"),
      })),
    keyOf: (p) =>
      [
        studentId.get(p.studentExt),
        p.amount.toFixed(2),
        p.paidAt,
        p.method ?? "",
        p.comment ?? "",
        p.groupName ?? "",
      ].join("|"),
    dataOf: (p) => ({
      studentId: studentId.get(p.studentExt)!,
      branchId: branchOf(p.branchExt),
      groupName: p.groupName,
      amount: p.amount,
      paidAt: isoToDate(p.paidAt),
      method: p.method,
      comment: p.comment,
    }),
    createMany: (data) => tx.legacyPayment.createMany({ data }),
    update: (id, data) => tx.legacyPayment.update({ where: { id }, data }),
    deleteMany: (ids) => tx.legacyPayment.deleteMany({ where: { id: { in: ids } } }),
  });

  // --- Attendance ------------------------------------------------------------------
  log("attendance");
  const lessonGroupIds = [...new Set(snapshot.lessons.map((l) => groupId.get(l.groupExt)))].filter(
    (id): id is string => !!id,
  );
  const lessonByDay = new Map<string, string>();
  for (const part of chunks(lessonGroupIds, 50)) {
    const rows = await tx.lesson.findMany({
      where: { groupId: { in: part } },
      select: { id: true, groupId: true, date: true },
      orderBy: { startTime: "desc" },
    });
    // With two lessons on one day the earliest one takes the marks.
    for (const row of rows) lessonByDay.set(`${row.groupId}|${dateToIso(row.date)}`, row.id);
  }
  const newLessons: Prisma.LessonCreateManyInput[] = [];
  const lessonIdOf = (groupExt: string, day: string): string | null => {
    const group = groupId.get(groupExt);
    if (!group) return null;
    const key = `${group}|${day}`;
    const known = lessonByDay.get(key);
    if (known) return known;
    const slots = groupSlots.get(groupExt) ?? [];
    const slot = slots.find((s) => s.weekday === weekdayOf(day)) ?? slots[0];
    const id = randomUUID();
    newLessons.push({
      id,
      groupId: group,
      date: isoToDate(day),
      startTime: slot?.startTime ?? "09:00",
      endTime: slot?.endTime ?? "10:00",
    });
    lessonByDay.set(key, id);
    count("lessons").created += 1;
    return id;
  };
  const wanted: Array<{
    lessonId: string;
    membershipId: string;
    status: string;
    comment: string | null;
    day: string;
  }> = [];
  for (const lesson of snapshot.lessons) {
    const lessonId = lessonIdOf(lesson.groupExt, lesson.date);
    if (!lessonId) continue;
    for (const mark of lesson.marks) {
      const oldStudent = mark.studentExt.split(":")[1] ?? "";
      const member = membershipId.get(`${lesson.groupExt}:${oldStudent}`);
      if (!member) {
        count("attendance").skipped += 1;
        continue;
      }
      wanted.push({
        lessonId,
        membershipId: member,
        status: mark.status,
        comment: mark.comment,
        day: lesson.date,
      });
    }
  }
  for (const part of chunks(newLessons)) await tx.lesson.createMany({ data: part });
  const haveMarks = new Map<string, { status: string; comment: string | null }>();
  for (const part of chunks(lessonGroupIds, 50)) {
    const rows = await tx.attendance.findMany({
      where: { lesson: { groupId: { in: part } } },
      select: { lessonId: true, membershipId: true, status: true, comment: true },
    });
    for (const row of rows) haveMarks.set(`${row.lessonId}|${row.membershipId}`, row);
  }
  const newMarks: Prisma.AttendanceCreateManyInput[] = [];
  for (const w of wanted) {
    const have = haveMarks.get(`${w.lessonId}|${w.membershipId}`);
    const status = w.status as "PRESENT" | "ABSENT" | "EXCUSED";
    if (!have) {
      newMarks.push({
        lessonId: w.lessonId,
        membershipId: w.membershipId,
        status,
        comment: w.comment,
        markedAt: new Date(`${w.day}T12:00:00+05:00`),
      });
      count("attendance").created += 1;
    } else if (have.status !== status || (have.comment ?? null) !== w.comment) {
      await tx.attendance.update({
        where: { lessonId_membershipId: { lessonId: w.lessonId, membershipId: w.membershipId } },
        data: { status, comment: w.comment },
      });
      count("attendance").updated += 1;
    } else {
      count("attendance").unchanged += 1;
    }
  }
  for (const part of chunks(newMarks, 2000)) {
    await tx.attendance.createMany({ data: part, skipDuplicates: true });
  }

  // --- Leads -----------------------------------------------------------------------
  log("leads");
  const boards = await tx.leadBoard.findMany({
    where: { branchId: { in: branchIds } },
    select: {
      id: true,
      branchId: true,
      name: true,
      sortOrder: true,
      columns: { select: { id: true, name: true, sortOrder: true } },
    },
  });
  const boardId = new Map<string, string>();
  const columnId = new Map<string, string>();
  for (const b of snapshot.leadBoards) {
    const home = branchOf(b.branchExt);
    let board = boards.find((x) => x.branchId === home && nameKey(x.name) === nameKey(b.name));
    if (!board) {
      const sortOrder =
        boards
          .filter((x) => x.branchId === home)
          .reduce((max, x) => Math.max(max, x.sortOrder), 0) + 1;
      const created = await tx.leadBoard.create({
        data: { branchId: home, name: b.name, sortOrder },
        select: { id: true, branchId: true, name: true, sortOrder: true },
      });
      board = { ...created, columns: [] };
      boards.push(board);
      count("leadBoards").created += 1;
    } else {
      count("leadBoards").unchanged += 1;
    }
    boardId.set(b.ext, board.id);
    let order = board.columns.reduce((max, c) => Math.max(max, c.sortOrder), 0);
    for (const name of b.columns.length ? b.columns : ["Leads"]) {
      let column = board.columns.find((c) => nameKey(c.name) === nameKey(name));
      if (!column) {
        order += 1;
        column = await tx.leadColumn.create({
          data: { boardId: board.id, name, sortOrder: order },
          select: { id: true, name: true, sortOrder: true },
        });
        board.columns.push(column);
      }
      columnId.set(`${b.ext}|${nameKey(name)}`, column.id);
    }
  }
  const leadIds = refs.entries("lead").map(([, id]) => id);
  const haveLeads = new Map<
    string,
    { id: string; columnId: string; status: string; isArchived: boolean; comment: string | null }
  >();
  for (const part of chunks(leadIds)) {
    const rows = await tx.lead.findMany({
      where: { id: { in: part } },
      select: { id: true, columnId: true, status: true, isArchived: true, comment: true },
    });
    for (const row of rows) haveLeads.set(row.id, row);
  }
  let leadOrder = 0;
  for (const l of snapshot.leads) {
    const board = boardId.get(l.boardExt);
    const column = columnId.get(`${l.boardExt}|${nameKey(l.column)}`);
    if (!board || !column) {
      count("leads").skipped += 1;
      continue;
    }
    const refId = refs.get("lead", l.ext);
    const existing = refId ? haveLeads.get(refId) : undefined;
    if (existing) {
      if (
        existing.columnId !== column ||
        existing.status !== l.status ||
        existing.isArchived !== l.archived ||
        existing.comment !== l.comment
      ) {
        await tx.lead.update({
          where: { id: existing.id },
          data: {
            boardId: board,
            columnId: column,
            status: l.status,
            isArchived: l.archived,
            comment: l.comment,
          },
        });
        count("leads").updated += 1;
      } else {
        count("leads").unchanged += 1;
      }
      continue;
    }
    leadOrder += 1;
    const created = await tx.lead.create({
      data: {
        branchId: branchOf(l.branchExt),
        boardId: board,
        columnId: column,
        fullName: l.fullName,
        sourceId: l.source ? (sourceId.get(nameKey(l.source)) ?? null) : null,
        teacherId: l.teacherExt ? (staffId.get(l.teacherExt) ?? null) : null,
        days: l.days,
        lessonTime: l.lessonTime,
        status: l.status,
        temperature: l.temperature,
        comment: l.comment,
        sortOrder: leadOrder,
        isArchived: l.archived,
        ...(l.createdAt ? { createdAt: new Date(l.createdAt) } : {}),
        phones: { create: l.phones.map((phone, index) => ({ phone, sortOrder: index })) },
      },
      select: { id: true },
    });
    refs.set("lead", l.ext, created.id);
    count("leads").created += 1;
  }

  // --- Finance ---------------------------------------------------------------------
  log("finance");
  const categories = await tx.financeCategory.findMany({
    where: { organizationId },
    select: { id: true, kind: true, name: true, sortOrder: true },
  });
  const categoryId = new Map(categories.map((c) => [`${c.kind}|${nameKey(c.name)}`, c.id]));
  let categoryOrder = categories.reduce((max, c) => Math.max(max, c.sortOrder), 0);
  for (const row of snapshot.finance) {
    if (!row.category || (row.type !== "EXPENSE" && row.type !== "INCOME")) continue;
    const key = `${row.type}|${nameKey(row.category)}`;
    if (categoryId.has(key)) continue;
    categoryOrder += 1;
    const created = await tx.financeCategory.create({
      data: { organizationId, kind: row.type, name: row.category, sortOrder: categoryOrder },
      select: { id: true },
    });
    categoryId.set(key, created.id);
    count("financeCategories").created += 1;
  }
  const financeData = (row: SoffSnapshot["finance"][number]) => ({
    branchId: branchOf(row.branchExt),
    type: row.type,
    categoryId: row.category
      ? (categoryId.get(`${row.type}|${nameKey(row.category)}`) ?? null)
      : null,
    paymentMethodId: row.method ? (methodId.get(nameKey(row.method)) ?? null) : null,
    amount: row.amount,
    date: isoToDate(row.date),
    comment: row.comment,
    staffId: row.staffExt ? (staffId.get(row.staffExt) ?? null) : null,
  });
  await syncByRef({
    tx,
    refs,
    kind: "finance",
    counter: count("finance"),
    rows: snapshot.finance,
    removeMissing: true,
    load: async (ids) =>
      (
        await tx.financeEntry.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            branchId: true,
            type: true,
            categoryId: true,
            paymentMethodId: true,
            amount: true,
            date: true,
            comment: true,
            staffId: true,
          },
        })
      ).map((row) => ({
        id: row.id,
        key: [
          row.branchId,
          row.type,
          row.categoryId ?? "",
          row.paymentMethodId ?? "",
          decimalToNumber(row.amount).toFixed(2),
          dateToIso(row.date),
          row.comment ?? "",
          row.staffId ?? "",
        ].join("|"),
      })),
    keyOf: (row) => {
      const d = financeData(row);
      return [
        d.branchId,
        d.type,
        d.categoryId ?? "",
        d.paymentMethodId ?? "",
        d.amount.toFixed(2),
        row.date,
        d.comment ?? "",
        d.staffId ?? "",
      ].join("|");
    },
    dataOf: financeData,
    createMany: (data) => tx.financeEntry.createMany({ data }),
    update: (id, data) => tx.financeEntry.update({ where: { id }, data }),
    deleteMany: (ids) => tx.financeEntry.deleteMany({ where: { id: { in: ids } } }),
  });

  // --- Exams -----------------------------------------------------------------------
  log("exams");
  const examIds = new Set(
    (
      await tx.exam.findMany({
        where: { id: { in: refs.entries("exam").map(([, id]) => id) } },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  for (const e of snapshot.exams) {
    const group = groupId.get(e.groupExt);
    if (!group) {
      count("exams").skipped += 1;
      continue;
    }
    const refId = refs.get("exam", e.ext);
    if (refId && examIds.has(refId)) {
      count("exams").unchanged += 1;
      continue;
    }
    const created = await tx.exam.create({
      data: {
        branchId: branchOf(e.branchExt),
        type: "GROUP",
        name: e.name,
        groupId: group,
        date: isoToDate(e.date),
        startTime: e.startTime,
        endTime: e.endTime,
        examinerId: e.examinerExt ? (staffId.get(e.examinerExt) ?? null) : null,
        roomId: e.roomExt ? (roomId.get(e.roomExt) ?? null) : null,
        passScore: e.passScore,
        maxScore: e.maxScore,
        status: e.finished ? "FINISHED" : "NOT_STARTED",
        finishedAt: e.finished ? isoToDate(e.date) : null,
      },
      select: { id: true },
    });
    refs.set("exam", e.ext, created.id);
    count("exams").created += 1;
  }

  await refs.flush(tx, organizationId);

  // --- The proof: balances as Kampus now shows them, beside the old system's ---------
  log("checking balances");
  const balances = new Map<string, number>();
  for (const part of chunks(touched, 300)) {
    for (const [id, b] of await membershipBalances(tx, part)) balances.set(id, b.balance);
  }
  for (const b of snapshot.branches) {
    const expected = new Map<string, number>();
    const kampus = new Map<string, number>();
    for (const m of snapshot.memberships) {
      const student = snapshot.students.find((s) => s.ext === m.studentExt);
      if (!student || student.branchExt !== b.ext) continue;
      expected.set(m.studentExt, (expected.get(m.studentExt) ?? 0) + m.balance);
      const id = membershipId.get(m.ext);
      if (id) kampus.set(m.studentExt, (kampus.get(m.studentExt) ?? 0) + (balances.get(id) ?? 0));
    }
    report.money.push({
      branch: b.name,
      expected: moneyTotals(expected.values()),
      kampus: moneyTotals(kampus.values()),
    });
  }

  // What could send a message to a real person once the data is in.
  const autoSms = await tx.autoSmsSetting.count({ where: { organizationId, isActive: true } });
  const sms = await tx.integrationSetting.findFirst({
    where: { organizationId, provider: "SMS", isEnabled: true },
    select: { id: true },
  });
  const telegramChats = await tx.studentTelegramChat.count({
    where: { student: { branchId: { in: branchIds } } },
  });
  note(
    `Automatic messages: ${autoSms} automatic SMS kinds are switched on, the centre's SMS provider is ${
      sms ? "connected" : "not connected"
    }, ${telegramChats} student or parent Telegram chats are linked`,
  );
}

interface SyncArgs<Row extends { ext: string }, Data> {
  tx: DbClient;
  refs: Refs;
  kind: string;
  counter: KindCount;
  rows: Row[];
  /** Delete the Kampus rows whose old record is gone (a payment that was removed there). */
  removeMissing: boolean;
  load: (ids: string[]) => Promise<Array<{ id: string; key: string }>>;
  keyOf: (row: Row) => string;
  dataOf: (row: Row) => Data;
  createMany: (data: Array<Data & { id: string }>) => Promise<unknown>;
  update: (id: string, data: Data) => Promise<unknown>;
  deleteMany: (ids: string[]) => Promise<unknown>;
}

/** Brings one kind of copied rows in line with the snapshot: add, change, and remove what is gone. */
async function syncByRef<Row extends { ext: string }, Data>(
  args: SyncArgs<Row, Data>,
): Promise<void> {
  const { refs, kind, counter } = args;
  const have = new Map<string, string>();
  for (const part of chunks(refs.entries(kind).map(([, id]) => id))) {
    for (const row of await args.load(part)) have.set(row.id, row.key);
  }
  const fresh: Array<Data & { id: string }> = [];
  const seen = new Set<string>();
  for (const row of args.rows) {
    seen.add(row.ext);
    const refId = refs.get(kind, row.ext);
    const key = refId ? have.get(refId) : undefined;
    if (refId && key !== undefined) {
      if (key === args.keyOf(row)) {
        counter.unchanged += 1;
      } else {
        await args.update(refId, args.dataOf(row));
        counter.updated += 1;
      }
      continue;
    }
    const id = randomUUID();
    fresh.push({ ...args.dataOf(row), id });
    refs.set(kind, row.ext, id);
    counter.created += 1;
  }
  for (const part of chunks(fresh)) await args.createMany(part);
  if (!args.removeMissing) return;
  const gone = refs.entries(kind).filter(([ext]) => !seen.has(ext));
  const goneIds = gone.map(([, id]) => id).filter((id) => have.has(id));
  for (const part of chunks(goneIds)) await args.deleteMany(part);
  for (const [ext] of gone) refs.drop(kind, ext);
  counter.removed += goneIds.length;
}
