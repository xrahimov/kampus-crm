import type { LeadFormInput, PublicLeadInput } from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import {
  referralSourceId,
  studentByReferralCode,
} from "@/server/services/students/referrals.service";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { mustFind, rethrowAsAppError } from "@/server/services/settings/shared";

import { findColumnInScope } from "./shared";

/* Settings → "Formalar" (EXP §8): public lead-capture forms, one column each. */

export interface LeadFormDto {
  id: string;
  name: string;
  slug: string;
  columnId: string;
  columnName: string;
  boardName: string;
  branchId: string;
  sourceId: string | null;
  sourceName: string | null;
  integration: string | null;
  isActive: boolean;
  /** Leads that arrived through the form. */
  leadCount: number;
  createdAt: string;
}

/** What the public page shows a visitor. */
export interface PublicLeadFormDto {
  name: string;
  organizationName: string;
  logoUrl: string | null;
}

const include = {
  column: { select: { name: true, board: { select: { name: true, branchId: true } } } },
  source: { select: { name: true } },
  _count: { select: { leads: true } },
} as const;

type Row = {
  id: string;
  name: string;
  slug: string;
  columnId: string;
  sourceId: string | null;
  integration: string | null;
  isActive: boolean;
  createdAt: Date;
  column: { name: string; board: { name: string; branchId: string } };
  source: { name: string } | null;
  _count: { leads: number };
};

function toDto(row: Row): LeadFormDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    columnId: row.columnId,
    columnName: row.column.name,
    boardName: row.column.board.name,
    branchId: row.column.board.branchId,
    sourceId: row.sourceId,
    sourceName: row.source?.name ?? null,
    integration: row.integration,
    isActive: row.isActive,
    leadCount: row._count.leads,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listForms(actor: Actor, db: DbClient = prisma): Promise<LeadFormDto[]> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  const rows = await db.leadForm.findMany({
    where: { organizationId },
    include,
    orderBy: { createdAt: "asc" },
  });
  return rows.map(toDto);
}

export async function createForm(
  actor: Actor,
  input: LeadFormInput,
  db: DbClient = prisma,
): Promise<LeadFormDto> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  const column = await findColumnInScope(db, actor, input.columnId);
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.leadForm.create({
        data: {
          organizationId,
          name: input.name,
          slug: input.slug,
          columnId: column.id,
          sourceId: input.sourceId ?? null,
          integration: input.integration ?? null,
          isActive: input.isActive,
        },
        include,
      });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "leadForm.create",
        entity: "LeadForm",
        entityId: row.id,
        after: dto,
        branchId: column.board.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "slug");
  }
}

export async function updateForm(
  actor: Actor,
  id: string,
  input: Partial<LeadFormInput>,
  db: DbClient = prisma,
): Promise<LeadFormDto> {
  authorize(actor, "settings.catalog");
  const existing = await mustFind(
    db.leadForm.findFirst({ where: { id, organizationId: actor.organizationId }, include }),
  );
  if (input.columnId && input.columnId !== existing.columnId) {
    await findColumnInScope(db, actor, input.columnId);
  }
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.leadForm.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.columnId !== undefined ? { columnId: input.columnId } : {}),
          ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
          ...(input.integration !== undefined ? { integration: input.integration } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include,
      });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "leadForm.update",
        entity: "LeadForm",
        entityId: id,
        before: toDto(existing),
        after: dto,
        branchId: row.column.board.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "slug");
  }
}

/** Leads that came through the form keep their rows (the link is cleared). */
export async function deleteForm(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "settings.catalog");
  const existing = await mustFind(
    db.leadForm.findFirst({ where: { id, organizationId: actor.organizationId }, include }),
  );
  await db.$transaction(async (tx) => {
    await tx.leadForm.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "leadForm.delete",
      entity: "LeadForm",
      entityId: id,
      before: toDto(existing),
      branchId: existing.column.board.branchId,
    });
  });
}

/** Public, unauthenticated: the form must exist and be active. */
export async function getPublicForm(
  slug: string,
  db: DbClient = prisma,
): Promise<PublicLeadFormDto | null> {
  const row = await db.leadForm.findUnique({
    where: { slug },
    select: { name: true, isActive: true, organization: { select: { name: true, logoUrl: true } } },
  });
  if (!row || !row.isActive) return null;
  return {
    name: row.name,
    organizationName: row.organization.name,
    logoUrl: row.organization.logoUrl,
  };
}

/** Submissions per IP address inside the window before the form answers 429 (A-69). */
export const FORM_SUBMIT_MAX = 10;
export const FORM_SUBMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * A visitor's submission: one lead at the end of the form's column, with the
 * form's source. The actor is the system (no user), so the audit row has no actor.
 */
export async function submitPublicForm(
  slug: string,
  input: PublicLeadInput,
  ip: string | null,
  db: DbClient = prisma,
): Promise<{ id: string }> {
  const form = await db.leadForm.findUnique({
    where: { slug },
    include: {
      column: { select: { name: true, boardId: true, board: { select: { branchId: true } } } },
      source: { select: { name: true } },
    },
  });
  if (!form || !form.isActive) throw AppError.notFound("errors.formNotFound");
  // An invite code in the link names the student who brought the lead (A-120); the
  // centre's "friend" source, when it has one, replaces the form's source then.
  const referrer = input.ref
    ? await studentByReferralCode(db, form.organizationId, input.ref)
    : null;
  const sourceId = referrer
    ? ((await referralSourceId(db, form.organizationId)) ?? form.sourceId)
    : form.sourceId;
  const key = `form:ip:${ip ?? "unknown"}`;
  const since = new Date(Date.now() - FORM_SUBMIT_WINDOW_MS);
  const recent = await db.loginAttempt.count({ where: { key, createdAt: { gt: since } } });
  if (recent >= FORM_SUBMIT_MAX) {
    throw AppError.rateLimited(Math.ceil(FORM_SUBMIT_WINDOW_MS / 1000));
  }
  return db.$transaction(async (tx) => {
    await tx.loginAttempt.create({ data: { key } });
    const last = await tx.lead.findFirst({
      where: { columnId: form.columnId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const lead = await tx.lead.create({
      data: {
        branchId: form.column.board.branchId,
        boardId: form.column.boardId,
        columnId: form.columnId,
        fullName: input.fullName,
        sourceId,
        referrerId: referrer?.id ?? null,
        comment: input.comment ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        formId: form.id,
        phones: { create: [{ phone: input.phone, sortOrder: 0 }] },
      },
    });
    await recordAudit(tx, null, {
      action: "lead.create",
      entity: "Lead",
      entityId: lead.id,
      after: {
        fullName: lead.fullName,
        phone: input.phone,
        formId: form.id,
        referrerId: referrer?.id ?? null,
      },
      branchId: form.column.board.branchId,
    });
    // The in-app bell for the branch's lead handlers (A-97), as for leads entered by staff.
    await notifyUsers(tx, {
      kind: "LEAD",
      params: {
        name: lead.fullName,
        source: form.source?.name ?? form.name,
        column: form.column.name,
      },
      href: `/leads?boardId=${form.column.boardId}&q=${encodeURIComponent(lead.fullName)}`,
      branchId: form.column.board.branchId,
      permission: "leads.view",
    });
    return { id: lead.id };
  });
}
