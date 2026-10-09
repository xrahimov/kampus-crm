import { recordAudit } from "@/server/audit/audit";
import type { DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { enqueue } from "@/server/jobs/queue";
import {
  getAmoCrmClient,
  loadIntegrationConfig,
  saveAmoCrmTokens,
} from "@/server/services/integrations/integrations.service";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";

/*
 * Leads added in amoCRM (A-115). amoCRM posts "lead added" to
 * /api/v1/webhooks/amocrm?secret=…; the webhook queues one job per deal, and the
 * job fetches the deal and its contact through the amoCRM API and files a Kampus
 * lead in the configured column under the configured source ("Instagram" unless
 * changed). Deals Kampus itself pushed to amoCRM carry their amoCRM id and are
 * not imported again; so is a person whose phone is already on the board.
 */

export interface AmoCrmWebhookLead {
  id: string;
  name: string | null;
  contactName: string | null;
  phones: string[];
  sourceName: string | null;
}

export interface AmoCrmWebhook {
  subdomain: string | null;
  added: AmoCrmWebhookLead[];
}

export interface AmoCrmImportPayload {
  organizationId: string;
  lead: AmoCrmWebhookLead;
}

export type AmoCrmImportResult = {
  leadId: string | null;
  skipped: "disabled" | "exists" | "phone" | null;
};

/** Digits only in, "+998…" out; null when it cannot be a phone number. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+998${digits}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * amoCRM posts form fields such as `leads[add][0][id]`; an item from "Unsorted"
 * nests the deal and its contact under `unsorted[add][0][data]`.
 */
export function parseAmoCrmWebhook(params: URLSearchParams): AmoCrmWebhook {
  const leads = new Map<string, AmoCrmWebhookLead>();
  const at = (key: string) => {
    let lead = leads.get(key);
    if (!lead) {
      lead = { id: "", name: null, contactName: null, phones: [], sourceName: null };
      leads.set(key, lead);
    }
    return lead;
  };
  for (const [key, raw] of params) {
    const value = raw.trim();
    let m = /^leads\[add\]\[(\d+)\]\[(id|name)\]$/.exec(key);
    if (m) {
      const lead = at(`lead:${m[1] ?? ""}`);
      if (m[2] === "id") lead.id = value;
      else lead.name = value || null;
      continue;
    }
    m = /^unsorted\[add\]\[(\d+)\]\[(.+)\]$/.exec(key);
    if (!m) continue;
    const lead = at(`unsorted:${m[1] ?? ""}`);
    const rest = m[2] ?? "";
    if (rest === "source_name") lead.sourceName = value || null;
    else if (rest === "data][leads][0][id") lead.id = value;
    else if (rest === "data][leads][0][name") lead.name = value || null;
    else if (rest === "data][contacts][0][name") lead.contactName = value || null;
    else if (
      /^data\]\[contacts\]\[0\]\[custom_fields\]\[\d+\]\[values\]\[\d+\]\[value$/.test(rest)
    ) {
      const phone = normalizePhone(value);
      if (phone && !lead.phones.includes(phone)) lead.phones.push(phone);
    }
  }
  return {
    subdomain: params.get("account[subdomain]")?.trim() || null,
    added: [...leads.values()].filter((lead) => lead.id !== ""),
  };
}

/** Queues one import per deal; a deal already queued or imported is not queued again. */
export async function receiveAmoCrmWebhook(
  db: DbClient,
  organizationId: string,
  hook: AmoCrmWebhook,
): Promise<{ queued: number; ignored: number }> {
  const config = await loadIntegrationConfig(db, "AMOCRM", organizationId);
  const sub = (config?.subDomain ?? "").toLowerCase();
  if (sub && hook.subdomain && hook.subdomain.toLowerCase() !== sub) throw AppError.forbidden();
  let queued = 0;
  for (const lead of hook.added) {
    const payload: AmoCrmImportPayload = { organizationId, lead };
    const id = await enqueue(db, {
      type: "amocrm.importLead",
      payload,
      uniqueKey: `amocrm:in:${organizationId}:${lead.id}`,
    });
    if (id) queued += 1;
  }
  return { queued, ignored: hook.added.length - queued };
}

const columnSelect = {
  id: true,
  name: true,
  boardId: true,
  board: { select: { branchId: true } },
} as const;

/** The configured column when it still exists in the centre, else the first column of the first board. */
async function resolveColumn(db: DbClient, organizationId: string, preferred: string) {
  if (preferred) {
    const column = await db.leadColumn.findFirst({
      where: { id: preferred, board: { branch: { organizationId } } },
      select: columnSelect,
    });
    if (column) return column;
  }
  const column = await db.leadColumn.findFirst({
    where: { board: { branch: { organizationId, isActive: true } } },
    orderBy: [
      { board: { branch: { name: "asc" } } },
      { board: { sortOrder: "asc" } },
      { board: { createdAt: "asc" } },
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    select: columnSelect,
  });
  if (!column) throw new Error(`amocrm: organisation ${organizationId} has no lead board`);
  return column;
}

/** The job behind the webhook: one amoCRM deal becomes one Kampus lead, or is skipped with a reason. */
export async function importAmoCrmLead(
  db: DbClient,
  input: AmoCrmImportPayload,
): Promise<AmoCrmImportResult> {
  const { organizationId, lead: hook } = input;
  const config = await loadIntegrationConfig(db, "AMOCRM", organizationId);
  if (!config?.isEnabled) return { leadId: null, skipped: "disabled" };
  const existing = await db.lead.findFirst({
    where: { amoCrmLeadId: hook.id, branch: { organizationId } },
    select: { id: true },
  });
  if (existing) return { leadId: null, skipped: "exists" };

  // The deal and its contact from amoCRM; the webhook's own fields when the API is out of reach.
  let name = hook.name;
  let contactName = hook.contactName;
  let phones = [...hook.phones];
  let tags: string[] = [];
  try {
    const client = await getAmoCrmClient(db, organizationId);
    const remote = await client.fetchLead(hook.id);
    if (client.tokens()) await saveAmoCrmTokens(db, organizationId, client.tokens());
    name = remote.name ?? name;
    contactName = remote.contactName ?? contactName;
    phones = [
      ...new Set(
        [...remote.phones.map(normalizePhone), ...phones].filter((p): p is string => p !== null),
      ),
    ];
    tags = remote.tags;
  } catch (error) {
    console.warn(`amocrm: deal ${hook.id} not fetched, using the webhook fields`, error);
  }

  if (phones.length > 0) {
    const same = await db.lead.findFirst({
      where: {
        isArchived: false,
        branch: { organizationId },
        phones: { some: { phone: { in: phones } } },
      },
      select: { id: true },
    });
    if (same) return { leadId: null, skipped: "phone" };
  }

  const column = await resolveColumn(db, organizationId, config.leadColumnId);
  const sourceName = config.leadSourceName.trim() || "Instagram";
  const source = await db.leadSource.upsert({
    where: { organizationId_name: { organizationId, name: sourceName } },
    create: { organizationId, name: sourceName },
    update: {},
  });
  const fullName = contactName || name || `amoCRM #${hook.id}`;
  const link = config.subDomain
    ? `https://${config.subDomain}.amocrm.ru/leads/detail/${hook.id}`
    : `amoCRM #${hook.id}`;
  const comment = [link, hook.sourceName, ...tags].filter(Boolean).join(" · ");
  const branchId = column.board.branchId;

  const row = await db.$transaction(async (tx) => {
    const last = await tx.lead.findFirst({
      where: { columnId: column.id },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const created = await tx.lead.create({
      data: {
        branchId,
        boardId: column.boardId,
        columnId: column.id,
        fullName,
        sourceId: source.id,
        comment,
        amoCrmLeadId: hook.id,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        phones: { create: phones.map((phone, sortOrder) => ({ phone, sortOrder })) },
      },
    });
    await recordAudit(tx, null, {
      action: "lead.create",
      entity: "Lead",
      entityId: created.id,
      after: { fullName, phones, source: sourceName, amoCrmLeadId: hook.id },
      branchId,
    });
    // The in-app bell for the branch's lead handlers (A-97), as for every other new lead.
    await notifyUsers(tx, {
      kind: "LEAD",
      params: { name: fullName, source: sourceName, column: column.name },
      href: `/leads?boardId=${column.boardId}&q=${encodeURIComponent(fullName)}`,
      branchId,
      permission: "leads.view",
    });
    return created;
  });
  return { leadId: row.id, skipped: null };
}
