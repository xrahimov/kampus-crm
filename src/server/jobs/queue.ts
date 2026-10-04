import type { Prisma } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/prisma";

/*
 * Postgres-backed job queue (A-21): one table, `FOR UPDATE SKIP LOCKED` to
 * claim rows, so several workers can run without any other infrastructure.
 */

export interface JobInput {
  type: string;
  payload: unknown;
  runAt?: Date;
  /** Same key = same job; a duplicate enqueue is a no-op. */
  uniqueKey?: string;
}

export type JobHandler = (payload: unknown, db: DbClient) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function hasJobHandler(type: string): boolean {
  return handlers.has(type);
}

/** Adds a job; safe inside a transaction so a rolled-back change leaves no job behind. */
export async function enqueue(db: DbClient, input: JobInput): Promise<string | null> {
  if (input.uniqueKey) {
    const existing = await db.job.findUnique({ where: { uniqueKey: input.uniqueKey } });
    if (existing) return null;
  }
  const row = await db.job.create({
    data: {
      type: input.type,
      payload: (input.payload ?? {}) as Prisma.InputJsonValue,
      runAt: input.runAt ?? new Date(),
      uniqueKey: input.uniqueKey ?? null,
    },
  });
  return row.id;
}

const MAX_ATTEMPTS = 5;

async function claim(db: DbClient, limit: number): Promise<string[]> {
  // Claim rows atomically; a crashed worker's RUNNING rows are retried after 10 minutes.
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = now(), attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE ("status" = 'PENDING' AND "runAt" <= now())
         OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
      ORDER BY "runAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`;
  return rows.map((r) => r.id);
}

export interface RunResult {
  claimed: number;
  done: number;
  failed: number;
}

/** Runs up to `limit` due jobs once. The worker loops over it; a cron can call it via the API. */
export async function runDueJobs(limit = 20, db: DbClient = prisma): Promise<RunResult> {
  const ids = await claim(db, limit);
  const result: RunResult = { claimed: ids.length, done: 0, failed: 0 };
  for (const id of ids) {
    const job = await db.job.findUnique({ where: { id } });
    if (!job) continue;
    const handler = handlers.get(job.type);
    try {
      if (!handler) throw new Error(`no handler for job type ${job.type}`);
      await handler(job.payload, db);
      await db.job.update({
        where: { id },
        data: { status: "DONE", doneAt: new Date(), lastError: null },
      });
      result.done += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const giveUp = job.attempts >= MAX_ATTEMPTS;
      await db.job.update({
        where: { id },
        data: {
          status: giveUp ? "FAILED" : "PENDING",
          lastError: message.slice(0, 1000),
          // Exponential backoff: 1, 2, 4, 8 minutes.
          runAt: new Date(Date.now() + 60_000 * 2 ** Math.max(0, job.attempts - 1)),
        },
      });
      result.failed += 1;
    }
  }
  return result;
}
