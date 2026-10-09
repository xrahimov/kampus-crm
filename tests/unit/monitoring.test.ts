/**
 * Monitoring and alerts (A-134) against the real database: the status card's
 * rows from heartbeats, jobs and recorded errors; the alert pass opening,
 * repeating and resolving alerts through the (fake) Telegram bot; the flag.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { fakeTelegramOutbox } from "@/server/integrations/telegram/notifier";
import type { Actor } from "@/server/rbac/authorize";
import {
  ALERT_RESEND_MS,
  BACKUP_STALE_MS,
  evaluateAlerts,
  getSystemStatus,
  recordHeartbeat,
  recordServerError,
  runMonitoringCheck,
  setAlertRecipient,
  WORKER_STALE_MS,
} from "@/server/services/system/monitoring.service";

import { DEMO_ORG_ID } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const CHAT = `9${RUN}`;

const owner: Actor = {
  userId: "",
  fullName: "Owner",
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};
const ceo: Actor = { ...owner, fullName: "CEO", isSiteOwner: false };

const alertsTo = (chat: string) => fakeTelegramOutbox.filter((m) => m.chatId === chat);

let failedJobId = "";

beforeAll(async () => {
  // A clean slate for the singletons the tests drive.
  await prisma.systemState.deleteMany({
    where: { key: { in: ["worker", "backup", "backup.error", "monitor", "alerts.recipient"] } },
  });
  await prisma.systemState.deleteMany({ where: { key: { startsWith: "alert." } } });
  await setAlertRecipient(owner, { chatId: CHAT });
});

afterAll(async () => {
  if (failedJobId) await prisma.job.deleteMany({ where: { id: failedJobId } });
  await prisma.systemState.deleteMany({ where: { key: { startsWith: "alert." } } });
  await prisma.systemState.deleteMany({ where: { key: "alerts.recipient" } });
  await recordHeartbeat(prisma, "worker", {});
});

describe("system status", () => {
  it("is for the site owner only", async () => {
    await expect(getSystemStatus(ceo)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setAlertRecipient(ceo, { chatId: "1234" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("reads the worker and backup heartbeats, the queue, the disk and recorded errors", async () => {
    const now = new Date();
    await recordHeartbeat(prisma, "worker", { claimed: 0 }, now);
    await recordHeartbeat(
      prisma,
      "backup",
      { file: "kampus-test.sql.gz", sizeBytes: 12345, freeBytes: 10 * 1024 ** 3 },
      new Date(now.getTime() - 3_600_000),
    );
    const job = await prisma.job.create({
      data: {
        type: "sms.send",
        payload: {},
        status: "FAILED",
        attempts: 5,
        lastError: `${RUN} provider down`,
        lockedAt: now,
      },
    });
    failedJobId = job.id;
    recordServerError(new Error(`${RUN} boom`), "/api/v1/test");
    await new Promise((r) => setTimeout(r, 200));

    const status = await getSystemStatus(owner, prisma, now);
    expect(status.worker).toMatchObject({ level: "ok", lastTickAt: now.toISOString() });
    expect(status.backup).toMatchObject({
      level: "ok",
      file: "kampus-test.sql.gz",
      sizeBytes: 12345,
      error: null,
    });
    expect(status.jobs.failedRecent).toBeGreaterThanOrEqual(1);
    expect(status.jobs.lastError?.message).toContain(RUN);
    expect(status.database.level).toBe("ok");
    expect(status.disk?.freeBytes).toBeGreaterThan(0);
    expect(status.errors.last24h).toBeGreaterThanOrEqual(1);
    expect(status.errors.recent.some((e) => e.message.includes(RUN))).toBe(true);
    expect(status.alerts.chatId).toBe(CHAT);
    // A failed job is worth attention, nothing is down.
    expect(status.level).toBe("warning");
  });

  it("grades a silent worker, a stale backup and a failed backup attempt", async () => {
    const now = new Date();
    await recordHeartbeat(prisma, "worker", {}, new Date(now.getTime() - WORKER_STALE_MS - 60_000));
    await recordHeartbeat(prisma, "backup", {}, new Date(now.getTime() - BACKUP_STALE_MS - 60_000));
    const status = await getSystemStatus(owner, prisma, now);
    expect(status.worker.level).toBe("down");
    expect(status.backup.level).toBe("warning");
    expect(status.level).toBe("down");

    const wanted = evaluateAlerts(status, new Date(now.getTime() - 86_400_000), now);
    expect([...wanted.keys()]).toEqual(expect.arrayContaining(["worker", "backup", "jobs"]));
    expect(wanted.get("worker")).toContain("silent");

    await recordHeartbeat(prisma, "backup", {}, new Date(now.getTime() - 3_600_000));
    await recordHeartbeat(prisma, "backup.error", { message: "pg_dump failed" }, now);
    const failed = await getSystemStatus(owner, prisma, now);
    expect(failed.backup.level).toBe("warning");
    expect(failed.backup.error?.message).toBe("pg_dump failed");
    await prisma.systemState.deleteMany({ where: { key: "backup.error" } });
  });

  it("stays quiet about a worker or backup that has not reported while monitoring is new", () => {
    const base = {
      level: "ok" as const,
      checkedAt: new Date().toISOString(),
      app: { uptimeSeconds: 1, nodeVersion: "v22" },
      database: { level: "ok" as const, latencyMs: 1 },
      worker: { level: "unknown" as const, lastTickAt: null },
      jobs: { level: "ok" as const, pending: 0, overdue: 0, failedRecent: 0, lastError: null },
      backup: {
        level: "unknown" as const,
        lastAt: null,
        file: null,
        sizeBytes: null,
        freeBytes: null,
        error: null,
      },
      disk: null,
      errors: { level: "ok" as const, last24h: 0, recent: [] },
      alerts: { chatId: null, botReady: false, open: [], lastSentAt: null },
    };
    const now = new Date();
    expect(evaluateAlerts(base, now, now).size).toBe(0);
    const later = evaluateAlerts(base, new Date(now.getTime() - 2 * 86_400_000), now);
    expect([...later.keys()].sort()).toEqual(["backup", "worker"]);
  });
});

describe("alert pass", () => {
  it("opens an alert once, repeats it after six hours and sends a resolved message", async () => {
    const t0 = new Date();
    await recordHeartbeat(prisma, "monitor", {}, new Date(t0.getTime() - 86_400_000));
    await recordHeartbeat(prisma, "worker", {}, new Date(t0.getTime() - WORKER_STALE_MS - 60_000));
    const before = alertsTo(CHAT).length;

    const first = await runMonitoringCheck(prisma, t0);
    expect(first.sent).toContain("worker");
    expect(first.status.alerts.open.map((a) => a.key)).toContain("worker");
    const sentFirst = alertsTo(CHAT).slice(before);
    expect(sentFirst.some((m) => m.text.startsWith("⚠️ Kampus server: The worker is silent"))).toBe(
      true,
    );

    // Five minutes later the same problem is not repeated.
    const t1 = new Date(t0.getTime() + 5 * 60_000);
    const second = await runMonitoringCheck(prisma, t1);
    expect(second.sent).not.toContain("worker");

    // After the resend window it is.
    const t2 = new Date(t0.getTime() + ALERT_RESEND_MS + 60_000);
    const third = await runMonitoringCheck(prisma, t2);
    expect(third.sent).toContain("worker");
    expect(alertsTo(CHAT).at(-1)?.text).toContain("still open");

    // The worker comes back: the alert closes with a message.
    const t3 = new Date(t2.getTime() + 60_000);
    await recordHeartbeat(prisma, "worker", {}, t3);
    const fourth = await runMonitoringCheck(prisma, t3);
    expect(fourth.sent).toContain("resolved:worker");
    expect(fourth.status.alerts.open.map((a) => a.key)).not.toContain("worker");
    expect(alertsTo(CHAT).at(-1)?.text).toContain("✅ Kampus server, resolved");
    expect(fourth.status.alerts.lastSentAt).not.toBeNull();
  });

  it("sends nothing without a recipient but still tracks the open alert", async () => {
    await prisma.systemState.deleteMany({ where: { key: "alerts.recipient" } });
    await prisma.systemState.deleteMany({ where: { key: { startsWith: "alert." } } });
    const now = new Date();
    await recordHeartbeat(prisma, "worker", {}, new Date(now.getTime() - WORKER_STALE_MS - 60_000));
    const before = fakeTelegramOutbox.length;
    const result = await runMonitoringCheck(prisma, now);
    expect(result.sent).toEqual([]);
    expect(result.status.alerts.open.map((a) => a.key)).toContain("worker");
    expect(fakeTelegramOutbox.length).toBe(before);
    expect(result.status.alerts.chatId).toBeNull();
  });
});
