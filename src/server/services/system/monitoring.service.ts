import { statfs } from "node:fs/promises";

import type { Prisma } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorizeSiteOwner, type Actor } from "@/server/rbac/authorize";
import {
  getTelegramNotifier,
  loadIntegrationConfig,
} from "@/server/services/integrations/integrations.service";

/*
 * Monitoring and alerts (round 2 F5, A-134). The server keeps a few facts
 * about itself in `SystemState` (the worker's last tick, the backup's last
 * run, the alert recipient, open alerts) and `SystemEvent` (HTTP 500s and
 * alerts sent). The site owner reads them on Settings → Organisations; a
 * periodic check, driven by the health endpoint Docker polls, sends alerts to
 * a Telegram chat through the site owner's organisation bot.
 */

export const WORKER_STALE_MS = 3 * 60_000;
export const BACKUP_STALE_MS = 26 * 3_600_000;
export const DISK_LOW_BYTES = 2 * 1024 ** 3;
export const DISK_CRITICAL_BYTES = 512 * 1024 ** 2;
export const ERROR_BURST_COUNT = 5;
export const ERROR_BURST_MS = 15 * 60_000;
/** An alert still open after this long is sent again as a reminder. */
export const ALERT_RESEND_MS = 6 * 3_600_000;
const CHECK_EVERY_MS = 5 * 60_000;
const EVENTS_KEEP_MS = 7 * 24 * 3_600_000;

const KEY_WORKER = "worker";
const KEY_BACKUP = "backup";
const KEY_BACKUP_ERROR = "backup.error";
const KEY_MONITOR = "monitor";
const KEY_RECIPIENT = "alerts.recipient";
const ALERT_PREFIX = "alert.";

export type StatusLevel = "ok" | "warning" | "down" | "unknown";

export interface SystemStatusDto {
  level: StatusLevel;
  checkedAt: string;
  app: { uptimeSeconds: number; nodeVersion: string };
  database: { level: StatusLevel; latencyMs: number };
  worker: { level: StatusLevel; lastTickAt: string | null };
  jobs: {
    level: StatusLevel;
    pending: number;
    overdue: number;
    failedRecent: number;
    lastError: { type: string; message: string; at: string | null } | null;
  };
  backup: {
    level: StatusLevel;
    lastAt: string | null;
    file: string | null;
    sizeBytes: number | null;
    freeBytes: number | null;
    error: { at: string; message: string } | null;
  };
  disk: { level: StatusLevel; path: string; freeBytes: number; totalBytes: number } | null;
  errors: {
    level: StatusLevel;
    last24h: number;
    recent: Array<{ at: string; message: string; path: string | null }>;
  };
  alerts: {
    chatId: string | null;
    botReady: boolean;
    open: Array<{ key: string; message: string; since: string }>;
    lastSentAt: string | null;
  };
}

type Meta = Record<string, unknown>;

async function stateOf(db: DbClient, key: string) {
  return db.systemState.findUnique({ where: { key } });
}

function metaOf(row: { meta: Prisma.JsonValue } | null | undefined): Meta {
  return row && row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
    ? (row.meta as Meta)
    : {};
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Writes or refreshes a heartbeat row; the worker calls it every tick. */
export async function recordHeartbeat(
  db: DbClient,
  key: string,
  meta?: Meta,
  at = new Date(),
): Promise<void> {
  const data = meta === undefined ? {} : { meta: meta as Prisma.InputJsonValue };
  await db.systemState.upsert({
    where: { key },
    create: { key, at, ...data },
    update: { at, ...data },
  });
}

let lastErrorRecordedAt = 0;

/**
 * Remembers an unexpected error (an HTTP 500) for the status page and the
 * error-burst alert. Never throws and never waits: the response goes out first.
 * At most one row per second per process, so a flood cannot fill the table.
 */
export function recordServerError(error: unknown, path?: string | null): void {
  const now = Date.now();
  if (now - lastErrorRecordedAt < 1000) return;
  lastErrorRecordedAt = now;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  void prisma.systemEvent
    .create({ data: { kind: "error", message, path: path?.slice(0, 200) ?? null } })
    .catch(() => undefined);
}

async function measureDatabase(db: DbClient): Promise<SystemStatusDto["database"]> {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { level: "ok", latencyMs: Date.now() - started };
  } catch {
    return { level: "down", latencyMs: Date.now() - started };
  }
}

async function measureDisk(): Promise<SystemStatusDto["disk"]> {
  const path = process.env.UPLOAD_DIR ?? "uploads";
  try {
    const s = await statfs(path);
    const freeBytes = Number(s.bavail) * Number(s.bsize);
    const totalBytes = Number(s.blocks) * Number(s.bsize);
    const level: StatusLevel =
      freeBytes < DISK_CRITICAL_BYTES ? "down" : freeBytes < DISK_LOW_BYTES ? "warning" : "ok";
    return { level, path, freeBytes, totalBytes };
  } catch {
    return null;
  }
}

function worst(levels: StatusLevel[]): StatusLevel {
  if (levels.includes("down")) return "down";
  if (levels.includes("warning")) return "warning";
  return "ok";
}

interface Snapshot {
  status: SystemStatusDto;
  recipient: { chatId: string; organizationId: string } | null;
  monitorSince: Date;
}

async function snapshot(db: DbClient, now: Date): Promise<Snapshot> {
  const dayAgo = new Date(now.getTime() - 24 * 3_600_000);
  const [states, database, disk, pending, overdue, failedRows, errors24h, recentErrors, lastAlert] =
    await Promise.all([
      db.systemState.findMany(),
      measureDatabase(db),
      measureDisk(),
      db.job.count({ where: { status: "PENDING" } }),
      db.job.count({
        where: { status: "PENDING", runAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      }),
      db.job.findMany({
        where: { status: "FAILED", lockedAt: { gte: dayAgo } },
        orderBy: { lockedAt: "desc" },
        select: { type: true, lastError: true, lockedAt: true },
      }),
      db.systemEvent.count({ where: { kind: "error", createdAt: { gte: dayAgo } } }),
      db.systemEvent.findMany({
        where: { kind: "error" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.systemEvent.findFirst({ where: { kind: "alert" }, orderBy: { createdAt: "desc" } }),
    ]);
  const byKey = new Map(states.map((s) => [s.key, s]));

  const workerRow = byKey.get(KEY_WORKER);
  const workerAge = workerRow ? now.getTime() - workerRow.at.getTime() : null;
  const worker: SystemStatusDto["worker"] = {
    level: workerAge === null ? "unknown" : workerAge > WORKER_STALE_MS ? "down" : "ok",
    lastTickAt: workerRow?.at.toISOString() ?? null,
  };

  const lastFailed = failedRows[0];
  const jobs: SystemStatusDto["jobs"] = {
    level: failedRows.length > 0 ? "warning" : "ok",
    pending,
    overdue,
    failedRecent: failedRows.length,
    lastError: lastFailed
      ? {
          type: lastFailed.type,
          message: lastFailed.lastError ?? "",
          at: lastFailed.lockedAt?.toISOString() ?? null,
        }
      : null,
  };

  const backupRow = byKey.get(KEY_BACKUP);
  const backupMeta = metaOf(backupRow);
  const backupErrorRow = byKey.get(KEY_BACKUP_ERROR);
  const backupError =
    backupErrorRow && (!backupRow || backupErrorRow.at > backupRow.at)
      ? { at: backupErrorRow.at.toISOString(), message: str(metaOf(backupErrorRow).message) ?? "" }
      : null;
  const backupAge = backupRow ? now.getTime() - backupRow.at.getTime() : null;
  const backup: SystemStatusDto["backup"] = {
    level:
      backupAge === null
        ? "unknown"
        : backupAge > BACKUP_STALE_MS || backupError
          ? "warning"
          : "ok",
    lastAt: backupRow?.at.toISOString() ?? null,
    file: str(backupMeta.file),
    sizeBytes: num(backupMeta.sizeBytes),
    freeBytes: num(backupMeta.freeBytes),
    error: backupError,
  };

  const burst = recentErrors.filter(
    (e) => now.getTime() - e.createdAt.getTime() < ERROR_BURST_MS,
  ).length;
  const errors: SystemStatusDto["errors"] = {
    level: burst >= ERROR_BURST_COUNT ? "warning" : "ok",
    last24h: errors24h,
    recent: recentErrors.map((e) => ({
      at: e.createdAt.toISOString(),
      message: e.message,
      path: e.path,
    })),
  };

  const recipientMeta = metaOf(byKey.get(KEY_RECIPIENT));
  const chatId = str(recipientMeta.chatId);
  const organizationId = str(recipientMeta.organizationId);
  const recipient = chatId && organizationId ? { chatId, organizationId } : null;
  const telegram = recipient
    ? await loadIntegrationConfig(db, "TELEGRAM", recipient.organizationId)
    : null;
  const open = states
    .filter((s) => s.key.startsWith(ALERT_PREFIX))
    .map((s) => ({
      key: s.key.slice(ALERT_PREFIX.length),
      message: str(metaOf(s).message) ?? "",
      since: s.at.toISOString(),
    }))
    .sort((a, b) => a.since.localeCompare(b.since));

  const monitorRow = byKey.get(KEY_MONITOR);
  const status: SystemStatusDto = {
    level: worst([
      database.level,
      worker.level,
      jobs.level,
      backup.level,
      disk?.level ?? "ok",
      errors.level,
    ]),
    checkedAt: now.toISOString(),
    app: { uptimeSeconds: Math.round(process.uptime()), nodeVersion: process.version },
    database,
    worker,
    jobs,
    backup,
    disk,
    errors,
    alerts: {
      chatId,
      botReady: Boolean(telegram?.isEnabled && telegram.botToken),
      open,
      lastSentAt: lastAlert?.createdAt.toISOString() ?? null,
    },
  };
  return { status, recipient, monitorSince: monitorRow?.at ?? now };
}

/** The status card's data; site owner only. */
export async function getSystemStatus(
  actor: Actor,
  db: DbClient = prisma,
  now = new Date(),
): Promise<SystemStatusDto> {
  authorizeSiteOwner(actor);
  return (await snapshot(db, now)).status;
}

function minutes(ms: number): number {
  return Math.round(ms / 60_000);
}

function hours(ms: number): number {
  return Math.round(ms / 3_600_000);
}

function gb(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** The alerts the snapshot calls for: rule key → message. */
export function evaluateAlerts(
  status: SystemStatusDto,
  monitorSince: Date,
  now = new Date(),
): Map<string, string> {
  const alerts = new Map<string, string>();
  const monitoredFor = now.getTime() - monitorSince.getTime();

  if (status.worker.lastTickAt === null) {
    if (monitoredFor > WORKER_STALE_MS) {
      alerts.set("worker", "The worker has not reported since the server started.");
    }
  } else {
    const age = now.getTime() - new Date(status.worker.lastTickAt).getTime();
    if (age > WORKER_STALE_MS) {
      alerts.set(
        "worker",
        `The worker is silent: last run ${minutes(age)} minutes ago. Jobs, SMS and Telegram messages are not being sent.`,
      );
    }
  }

  if (status.jobs.failedRecent > 0 && status.jobs.lastError) {
    alerts.set(
      "jobs",
      `${status.jobs.failedRecent} job(s) failed in the last 24 hours. Last: ${status.jobs.lastError.type} — ${status.jobs.lastError.message.slice(0, 200)}`,
    );
  }

  if (status.backup.lastAt === null) {
    if (monitoredFor > BACKUP_STALE_MS) {
      alerts.set("backup", "No database backup has been reported for more than a day.");
    }
  } else {
    const age = now.getTime() - new Date(status.backup.lastAt).getTime();
    if (age > BACKUP_STALE_MS) {
      alerts.set("backup", `The last database backup is ${hours(age)} hours old.`);
    } else if (status.backup.error) {
      alerts.set("backup", `The last backup attempt failed: ${status.backup.error.message}`);
    }
  }

  if (status.disk) {
    if (status.disk.freeBytes < DISK_CRITICAL_BYTES) {
      alerts.set(
        "disk",
        `Disk almost full: ${gb(status.disk.freeBytes)} of ${gb(status.disk.totalBytes)} free. Uploads and recordings will start failing.`,
      );
    } else if (status.disk.freeBytes < DISK_LOW_BYTES) {
      alerts.set(
        "disk",
        `Disk running low: ${gb(status.disk.freeBytes)} of ${gb(status.disk.totalBytes)} free.`,
      );
    }
  }

  if (status.errors.level !== "ok") {
    const last = status.errors.recent[0];
    alerts.set(
      "errors",
      `Server errors are piling up: ${status.errors.last24h} in the last 24 hours. Last: ${last?.message ?? ""}`,
    );
  }
  return alerts;
}

export interface CheckResult {
  status: SystemStatusDto;
  /** Rule keys a message went out for, "resolved:" prefixed when the alert closed. */
  sent: string[];
}

async function send(
  db: DbClient,
  recipient: { chatId: string; organizationId: string } | null,
  text: string,
): Promise<boolean> {
  if (!recipient) return false;
  const notifier = await getTelegramNotifier(db, recipient.organizationId);
  await notifier.sendMessage(recipient.chatId, text);
  await db.systemEvent.create({ data: { kind: "alert", message: text.slice(0, 500) } });
  return true;
}

/**
 * One monitoring pass: measures, opens, repeats and closes alerts, prunes old
 * events. Safe to run from several places; the state lives in the database.
 */
export async function runMonitoringCheck(
  db: DbClient = prisma,
  now = new Date(),
): Promise<CheckResult> {
  const monitor = await stateOf(db, KEY_MONITOR);
  if (!monitor) await recordHeartbeat(db, KEY_MONITOR, { startedAt: now.toISOString() }, now);
  const { status, recipient, monitorSince } = await snapshot(db, now);
  const wanted = evaluateAlerts(status, monitorSince, now);
  const sent: string[] = [];

  for (const [key, message] of wanted) {
    const row = await stateOf(db, ALERT_PREFIX + key);
    const meta = metaOf(row);
    const lastSentAt = str(meta.lastSentAt);
    const due =
      !row || !lastSentAt || now.getTime() - new Date(lastSentAt).getTime() > ALERT_RESEND_MS;
    if (!row) await recordHeartbeat(db, ALERT_PREFIX + key, { message }, now);
    if (!due) continue;
    const prefix = row ? "⚠️ Kampus server, still open: " : "⚠️ Kampus server: ";
    const delivered = await send(db, recipient, prefix + message);
    if (delivered) {
      sent.push(key);
      await db.systemState.update({
        where: { key: ALERT_PREFIX + key },
        data: { meta: { message, lastSentAt: now.toISOString() } as Prisma.InputJsonValue },
      });
    }
  }

  for (const open of status.alerts.open) {
    if (wanted.has(open.key)) continue;
    const row = await stateOf(db, ALERT_PREFIX + open.key);
    const wasSent = Boolean(str(metaOf(row).lastSentAt));
    await db.systemState.deleteMany({ where: { key: ALERT_PREFIX + open.key } });
    if (wasSent) {
      const openFor = minutes(now.getTime() - new Date(open.since).getTime());
      const delivered = await send(
        db,
        recipient,
        `✅ Kampus server, resolved after ${openFor} minutes: ${open.message}`,
      );
      if (delivered) sent.push(`resolved:${open.key}`);
    }
  }

  await db.systemEvent.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - EVENTS_KEEP_MS) } },
  });
  const after = await snapshot(db, now);
  return { status: after.status, sent };
}

let lastCheckAt = 0;

/**
 * Runs a check at most every five minutes per process, without waiting for it.
 * The health endpoint calls this on every poll, so Docker's health check is the
 * clock; nothing else has to be scheduled.
 */
export function maybeRunMonitoring(db: DbClient = prisma): void {
  const now = Date.now();
  if (now - lastCheckAt < CHECK_EVERY_MS) return;
  lastCheckAt = now;
  void runMonitoringCheck(db).catch((error) => {
    console.error("[monitoring] check failed", error);
  });
}

/** The Telegram chat that receives alerts, sent by the site owner's own bot. Empty clears it. */
export async function setAlertRecipient(
  actor: Actor,
  input: { chatId: string },
  db: DbClient = prisma,
): Promise<SystemStatusDto> {
  authorizeSiteOwner(actor);
  if (input.chatId) {
    await recordHeartbeat(db, KEY_RECIPIENT, {
      chatId: input.chatId,
      organizationId: actor.organizationId,
    });
  } else {
    await db.systemState.deleteMany({ where: { key: KEY_RECIPIENT } });
  }
  return getSystemStatus(actor, db);
}

/** Sends one test message to the configured chat, so the owner knows the path works. */
export async function sendTestAlert(actor: Actor, db: DbClient = prisma): Promise<void> {
  authorizeSiteOwner(actor);
  const { recipient, status } = await snapshot(db, new Date());
  if (!recipient) throw AppError.validation({ chatId: ["validation.required"] });
  if (!status.alerts.botReady) throw AppError.conflict("errors.telegramNotConfigured");
  await send(
    db,
    recipient,
    `🔔 Kampus server: test alert. Status ${status.level}, worker ${status.worker.level}, backup ${status.backup.level}.`,
  );
}

/** Site owner's manual "Check now". */
export async function checkNow(actor: Actor, db: DbClient = prisma): Promise<CheckResult> {
  authorizeSiteOwner(actor);
  return runMonitoringCheck(db);
}
