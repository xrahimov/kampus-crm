import type { Prisma } from "@/generated/prisma/client";
import type {
  CoinEvent,
  CoinRatingFilters,
  CoinReasonInput,
  CoinSettingsInput,
  GiveCoinsInput,
} from "@/lib/validation/coins";
import { COIN_EVENTS } from "@/lib/validation/coins";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, authorizeAny, branchScope, can, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, groupScope } from "@/server/services/groups/shared";
import { mustFind, rethrowAsAppError } from "@/server/services/settings/shared";
import { studentScope } from "@/server/services/students/students.service";

/* Coins (EXP §5 COINLAR, §8 Coin sozlamalari, §10 Coins REYTING). A-78, A-79. */

/** The reference's default rules: Davomat +5, Uy vazifasi +10, Test natijasi +20, Tug'ilgan kun +50. */
export const DEFAULT_COIN_RULES: Record<CoinEvent, number> = {
  ATTENDANCE: 5,
  HOMEWORK: 10,
  TEST_RESULT: 20,
  BIRTHDAY: 50,
  REFERRAL: 30,
};

export interface CoinRuleDto {
  event: CoinEvent;
  amount: number;
  isActive: boolean;
}

export interface CoinSettingsDto {
  autoCoins: boolean;
  rules: CoinRuleDto[];
}

export interface CoinReasonDto {
  id: string;
  name: string;
  maxCoins: number;
  isActive: boolean;
  usedCount: number;
}

export interface CoinTransactionDto {
  id: string;
  studentId: string;
  groupName: string | null;
  kind: "MANUAL" | "AUTO" | "PURCHASE";
  amount: number;
  reasonName: string | null;
  event: CoinEvent | null;
  comment: string | null;
  givenByName: string | null;
  createdAt: string;
}

export interface GroupCoinRowDto {
  rank: number;
  studentId: string;
  membershipId: string;
  fullName: string;
  /** The student's current balance across all groups (coins are a student-level currency, A-78). */
  balance: number;
  /** Coins earned in this group. */
  groupCoins: number;
  lastComment: string | null;
}

export interface CoinRatingRowDto {
  rank: number;
  studentId: string;
  fullName: string;
  branchName: string;
  balance: number;
  earned: number;
  spent: number;
  lastActivity: string | null;
}

export interface CoinsReportDto {
  kpis: {
    totalGiven: number;
    totalSpent: number;
    purchases: number;
    activeStudents: number;
  };
  rating: CoinRatingRowDto[];
}

const VIEW_PERMISSIONS = ["coins.give", "coins.manage", "settings.org", "reports.view"] as const;

async function ensureRules(db: DbClient, organizationId: string): Promise<void> {
  const existing = await db.coinRule.findMany({
    where: { organizationId },
    select: { event: true },
  });
  const have = new Set(existing.map((r) => r.event));
  const missing = COIN_EVENTS.filter((e) => !have.has(e));
  if (missing.length === 0) return;
  await db.coinRule.createMany({
    data: missing.map((event) => ({ organizationId, event, amount: DEFAULT_COIN_RULES[event] })),
    skipDuplicates: true,
  });
}

/** Settings → Coin sozlamalari. */
export async function getCoinSettings(
  actor: Actor,
  db: DbClient = prisma,
): Promise<CoinSettingsDto> {
  authorizeAny(actor, VIEW_PERMISSIONS);
  const organizationId = actor.organizationId;
  await ensureRules(db, organizationId);
  const [settings, rules] = await Promise.all([
    db.orgSettings.upsert({
      where: { organizationId },
      update: {},
      create: { organizationId },
      select: { autoCoins: true },
    }),
    db.coinRule.findMany({ where: { organizationId } }),
  ]);
  const order = new Map(COIN_EVENTS.map((e, i) => [e, i]));
  return {
    autoCoins: settings.autoCoins,
    rules: rules
      .sort((a, b) => (order.get(a.event) ?? 0) - (order.get(b.event) ?? 0))
      .map((r) => ({ event: r.event, amount: r.amount, isActive: r.isActive })),
  };
}

export async function updateCoinSettings(
  actor: Actor,
  input: CoinSettingsInput,
  db: DbClient = prisma,
): Promise<CoinSettingsDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  const before = await getCoinSettings(actor, db);
  await db.$transaction(async (tx) => {
    await tx.orgSettings.update({
      where: { organizationId },
      data: { autoCoins: input.autoCoins },
    });
    for (const rule of input.rules) {
      await tx.coinRule.upsert({
        where: { organizationId_event: { organizationId, event: rule.event } },
        update: { amount: rule.amount, isActive: rule.isActive },
        create: { organizationId, ...rule },
      });
    }
    await recordAudit(tx, actor, {
      action: "coinSettings.update",
      entity: "OrgSettings",
      entityId: organizationId,
      before,
      after: input,
    });
  });
  return getCoinSettings(actor, db);
}

/* ----- manual reasons ------------------------------------------------------------------- */

const reasonInclude = {
  _count: { select: { transactions: true } },
} satisfies Prisma.CoinReasonInclude;

function reasonToDto(
  r: Prisma.CoinReasonGetPayload<{ include: typeof reasonInclude }>,
): CoinReasonDto {
  return {
    id: r.id,
    name: r.name,
    maxCoins: r.maxCoins,
    isActive: r.isActive,
    usedCount: r._count.transactions,
  };
}

export async function listCoinReasons(
  actor: Actor,
  options: { activeOnly?: boolean } = {},
  db: DbClient = prisma,
): Promise<CoinReasonDto[]> {
  authorizeAny(actor, VIEW_PERMISSIONS);
  const organizationId = actor.organizationId;
  const rows = await db.coinReason.findMany({
    where: { organizationId, ...(options.activeOnly ? { isActive: true } : {}) },
    include: reasonInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(reasonToDto);
}

export async function createCoinReason(
  actor: Actor,
  input: CoinReasonInput,
  db: DbClient = prisma,
): Promise<CoinReasonDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.coinReason.create({
        data: { organizationId, ...input },
        include: reasonInclude,
      });
      await recordAudit(tx, actor, {
        action: "coinReason.create",
        entity: "CoinReason",
        entityId: row.id,
        after: input,
      });
      return reasonToDto(row);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateCoinReason(
  actor: Actor,
  id: string,
  input: CoinReasonInput,
  db: DbClient = prisma,
): Promise<CoinReasonDto> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  const before = await mustFind(
    db.coinReason.findFirst({ where: { id, organizationId } }),
    "errors.coinReasonNotFound",
  );
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.coinReason.update({
        where: { id },
        data: input,
        include: reasonInclude,
      });
      await recordAudit(tx, actor, {
        action: "coinReason.update",
        entity: "CoinReason",
        entityId: id,
        before,
        after: input,
      });
      return reasonToDto(row);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deleteCoinReason(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "settings.org");
  const organizationId = actor.organizationId;
  const before = await mustFind(
    db.coinReason.findFirst({ where: { id, organizationId }, include: reasonInclude }),
    "errors.coinReasonNotFound",
  );
  if (before._count.transactions > 0) throw AppError.conflict("errors.coinReasonUsed");
  await db.$transaction(async (tx) => {
    await tx.coinReason.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "coinReason.delete",
      entity: "CoinReason",
      entityId: id,
      before: { name: before.name },
    });
  });
}

/* ----- giving coins --------------------------------------------------------------------- */

const OPEN_MEMBER: Prisma.GroupMembershipWhereInput = {
  status: { notIn: ["ARCHIVED", "GRADUATED"] },
};

export async function studentBalance(db: DbClient, studentId: string): Promise<number> {
  const agg = await db.coinTransaction.aggregate({ where: { studentId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0;
}

/** "COIN BERISH": a manual award under one of the configured reasons, capped for teachers. */
export async function giveCoins(
  actor: Actor,
  input: GiveCoinsInput,
  db: DbClient = prisma,
): Promise<CoinTransactionDto> {
  authorize(actor, "coins.give");
  const organizationId = actor.organizationId;
  const reason = await mustFind(
    db.coinReason.findFirst({ where: { id: input.reasonId, organizationId } }),
    "errors.coinReasonNotFound",
  );
  if (!reason.isActive) throw AppError.validation({ reasonId: ["validation.reasonInactive"] });
  if (input.amount > reason.maxCoins && !can(actor, "coins.manage")) {
    throw AppError.validation({ amount: ["validation.coinsAboveMax"] });
  }
  let groupId: string | null = null;
  if (input.groupId) {
    const group = await findGroupInScope(db, actor, input.groupId, {
      memberships: { where: { studentId: input.studentId, ...OPEN_MEMBER }, select: { id: true } },
    });
    if (group.memberships.length === 0)
      throw AppError.validation({ studentId: ["validation.notMember"] });
    groupId = group.id;
  } else {
    const student = await db.student.findFirst({
      where: { id: input.studentId, ...studentScope(actor) },
      select: { id: true },
    });
    if (!student) throw AppError.notFound("errors.studentNotFound");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.coinTransaction.create({
      data: {
        studentId: input.studentId,
        groupId,
        kind: "MANUAL",
        amount: input.amount,
        reasonId: reason.id,
        comment: input.comment ?? null,
        givenById: actor.userId,
      },
      include: txInclude,
    });
    await recordAudit(tx, actor, {
      action: "coins.give",
      entity: "Student",
      entityId: input.studentId,
      after: { amount: input.amount, reason: reason.name, groupId },
    });
    return txToDto(row);
  });
}

const txInclude = {
  group: { select: { name: true } },
  reason: { select: { name: true } },
  givenBy: { select: { fullName: true } },
} satisfies Prisma.CoinTransactionInclude;

function txToDto(
  row: Prisma.CoinTransactionGetPayload<{ include: typeof txInclude }>,
): CoinTransactionDto {
  return {
    id: row.id,
    studentId: row.studentId,
    groupName: row.group?.name ?? null,
    kind: row.kind,
    amount: row.amount,
    reasonName: row.reason?.name ?? null,
    event: row.event,
    comment: row.comment,
    givenByName: row.givenBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Automatic award (A-79): no-op unless the organisation switch and the rule are on.
 * `refKey` makes the award idempotent; `revoke` removes an earlier award for the same key
 * (an attendance mark changed away from "present").
 */
export async function awardAutoCoins(
  tx: DbClient,
  input: {
    event: CoinEvent;
    studentId: string;
    groupId: string | null;
    refKey: string;
    revoke?: boolean;
  },
): Promise<void> {
  if (input.revoke) {
    await tx.coinTransaction.deleteMany({ where: { refKey: input.refKey, kind: "AUTO" } });
    return;
  }
  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { branch: { select: { organizationId: true } } },
  });
  if (!student) return;
  const organizationId = student.branch.organizationId;
  const settings = await tx.orgSettings.findUnique({
    where: { organizationId },
    select: { autoCoins: true },
  });
  if (!settings?.autoCoins) return;
  const rule = await tx.coinRule.findUnique({
    where: { organizationId_event: { organizationId, event: input.event } },
  });
  if (!rule || !rule.isActive || rule.amount <= 0) return;
  const existing = await tx.coinTransaction.findUnique({ where: { refKey: input.refKey } });
  if (existing) return;
  await tx.coinTransaction.create({
    data: {
      studentId: input.studentId,
      groupId: input.groupId,
      kind: "AUTO",
      amount: rule.amount,
      event: input.event,
      refKey: input.refKey,
    },
  });
}

/* ----- reading -------------------------------------------------------------------------- */

/** Group → COINLAR tab: members ranked by balance. */
export async function listGroupCoins(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupCoinRowDto[]> {
  authorize(actor, "groups.view");
  const group = await findGroupInScope(db, actor, groupId, {
    memberships: {
      where: OPEN_MEMBER,
      select: { id: true, studentId: true, student: { select: { fullName: true } } },
    },
  });
  const studentIds = group.memberships.map((m) => m.studentId);
  if (studentIds.length === 0) return [];
  const [balances, inGroup, comments] = await Promise.all([
    db.coinTransaction.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds } },
      _sum: { amount: true },
    }),
    db.coinTransaction.groupBy({
      by: ["studentId"],
      where: { studentId: { in: studentIds }, groupId, amount: { gt: 0 } },
      _sum: { amount: true },
    }),
    db.coinTransaction.findMany({
      where: { studentId: { in: studentIds }, groupId, comment: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { studentId: true, comment: true },
    }),
  ]);
  const balance = new Map(balances.map((b) => [b.studentId, b._sum.amount ?? 0]));
  const earned = new Map(inGroup.map((b) => [b.studentId, b._sum.amount ?? 0]));
  const lastComment = new Map<string, string>();
  for (const c of comments)
    if (!lastComment.has(c.studentId) && c.comment) lastComment.set(c.studentId, c.comment);
  return group.memberships
    .map((m) => ({
      studentId: m.studentId,
      membershipId: m.id,
      fullName: m.student.fullName,
      balance: balance.get(m.studentId) ?? 0,
      groupCoins: earned.get(m.studentId) ?? 0,
      lastComment: lastComment.get(m.studentId) ?? null,
    }))
    .sort((a, b) => b.balance - a.balance || a.fullName.localeCompare(b.fullName))
    .map((row, i) => ({ rank: i + 1, ...row }));
}

/** A student's coin history ("KO'RISH" in the rating). */
export async function listStudentCoins(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<{ balance: number; items: CoinTransactionDto[] }> {
  authorizeAny(actor, VIEW_PERMISSIONS);
  const student = await db.student.findFirst({
    where: { id: studentId, ...studentScope(actor) },
    select: { id: true },
  });
  if (!student) throw AppError.notFound("errors.studentNotFound");
  const rows = await db.coinTransaction.findMany({
    where: { studentId },
    include: txInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return { balance: await studentBalance(db, studentId), items: rows.map(txToDto) };
}

function periodStart(period: CoinRatingFilters["period"]): Date | null {
  if (period === "ALL") return null;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  if (period === "WEEK") d.setUTCDate(d.getUTCDate() - 7);
  else d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}

/** Reports → Coins: KPIs and the REYTING tab (EXP §10). */
export async function getCoinsReport(
  actor: Actor,
  filters: CoinRatingFilters,
  db: DbClient = prisma,
): Promise<CoinsReportDto> {
  authorizeAny(actor, ["reports.view", "coins.manage"]);
  if (filters.branchId && !actor.branchIds.includes(filters.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  const studentWhere: Prisma.StudentWhereInput = {
    ...branchScope(actor),
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.q
      ? {
          OR: [
            { fullName: { contains: filters.q, mode: "insensitive" } },
            { phone: { contains: filters.q } },
          ],
        }
      : {}),
    ...(filters.groupId || filters.courseId
      ? {
          memberships: {
            some: {
              ...OPEN_MEMBER,
              ...(filters.groupId ? { groupId: filters.groupId } : {}),
              ...(filters.courseId
                ? { group: { courseId: filters.courseId, ...groupScope(actor) } }
                : {}),
            },
          },
        }
      : {}),
  };
  const since = periodStart(filters.period);
  const txWhere: Prisma.CoinTransactionWhereInput = {
    student: studentWhere,
    ...(since ? { createdAt: { gte: since } } : {}),
  };
  const [earnedRows, spentRows, balanceRows, purchases] = await Promise.all([
    db.coinTransaction.groupBy({
      by: ["studentId"],
      where: { ...txWhere, amount: { gt: 0 } },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
    db.coinTransaction.groupBy({
      by: ["studentId"],
      where: { ...txWhere, amount: { lt: 0 } },
      _sum: { amount: true },
      _max: { createdAt: true },
    }),
    db.coinTransaction.groupBy({
      by: ["studentId"],
      where: { student: studentWhere },
      _sum: { amount: true },
    }),
    db.purchaseRequest.count({
      where: {
        status: "APPROVED",
        student: studentWhere,
        ...(since ? { decidedAt: { gte: since } } : {}),
      },
    }),
  ]);
  const ids = new Set<string>();
  for (const r of [...earnedRows, ...spentRows, ...balanceRows]) ids.add(r.studentId);
  const students = await db.student.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, fullName: true, branch: { select: { name: true } } },
  });
  const earned = new Map(earnedRows.map((r) => [r.studentId, r]));
  const spent = new Map(spentRows.map((r) => [r.studentId, r]));
  const balance = new Map(balanceRows.map((r) => [r.studentId, r._sum.amount ?? 0]));
  const rating = students
    .map((s) => {
      const e = earned.get(s.id);
      const sp = spent.get(s.id);
      const last = [e?._max.createdAt, sp?._max.createdAt]
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      return {
        studentId: s.id,
        fullName: s.fullName,
        branchName: s.branch.name,
        balance: balance.get(s.id) ?? 0,
        earned: e?._sum.amount ?? 0,
        spent: -(sp?._sum.amount ?? 0),
        lastActivity: last?.toISOString() ?? null,
      };
    })
    .filter((r) => filters.period === "ALL" || r.earned > 0 || r.spent > 0)
    .sort(
      (a, b) =>
        b.balance - a.balance || b.earned - a.earned || a.fullName.localeCompare(b.fullName),
    )
    .map((r, i) => ({ rank: i + 1, ...r }));
  return {
    kpis: {
      totalGiven: rating.reduce((s, r) => s + r.earned, 0),
      totalSpent: rating.reduce((s, r) => s + r.spent, 0),
      purchases,
      activeStudents: rating.filter((r) => r.balance > 0).length,
    },
    rating,
  };
}

export interface CoinReportOptions {
  branches: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string; branchId: string }>;
  groups: Array<{ id: string; name: string; branchId: string; courseId: string }>;
}

export async function getCoinReportOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<CoinReportOptions> {
  authorizeAny(actor, ["reports.view", "coins.manage"]);
  const branchWhere: Prisma.BranchWhereInput = { id: { in: actor.branchIds }, isActive: true };
  const [branches, courses, groups] = await Promise.all([
    db.branch.findMany({
      where: branchWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({
      where: { ...branchScope(actor), isArchived: false },
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    db.group.findMany({
      where: { ...groupScope(actor), status: { not: "ARCHIVED" } },
      select: { id: true, name: true, branchId: true, courseId: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { branches, courses, groups };
}

/** Student picker for purchase requests and manual awards outside a group. */
export async function searchCoinStudents(
  actor: Actor,
  q: string,
  db: DbClient = prisma,
): Promise<Array<{ id: string; fullName: string; phone: string | null; balance: number }>> {
  authorizeAny(actor, ["coins.give", "coins.manage"]);
  if (q.trim().length < 2) return [];
  const rows = await db.student.findMany({
    where: {
      ...studentScope(actor),
      isArchived: false,
      OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    },
    select: { id: true, fullName: true, phone: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
  const sums = await db.coinTransaction.groupBy({
    by: ["studentId"],
    where: { studentId: { in: rows.map((r) => r.id) } },
    _sum: { amount: true },
  });
  const balance = new Map(sums.map((s) => [s.studentId, s._sum.amount ?? 0]));
  return rows.map((r) => ({ ...r, balance: balance.get(r.id) ?? 0 }));
}
