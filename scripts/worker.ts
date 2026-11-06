/**
 * Background worker (A-21): claims due jobs from the Postgres queue and runs
 * them. Start with `npm run worker`; the docker-compose `worker` service runs it
 * next to the app. Stops cleanly on SIGINT/SIGTERM.
 *
 * Without a worker, POST /api/v1/jobs/run (settings.integrations) does one pass.
 */
import "dotenv/config";

import { prisma } from "../src/server/db/prisma";
import { ensureDailyJob, HEAVY_JOB_TYPES, registerJobHandlers } from "../src/server/jobs/handlers";
import { runDueJobs } from "../src/server/jobs/queue";
import { recordHeartbeat } from "../src/server/services/system/monitoring.service";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
let stopping = false;

async function tick() {
  try {
    await ensureDailyJob(prisma);
    const result = await runDueJobs(20, prisma, { exclude: HEAVY_JOB_TYPES });
    // The heartbeat the status card and the "worker silent" alert read (A-134).
    await recordHeartbeat(prisma, "worker", { ...result });
    if (result.claimed > 0) {
      console.log(`[worker] claimed=${result.claimed} done=${result.done} failed=${result.failed}`);
    }
  } catch (error) {
    console.error("[worker] tick failed", error);
  }
}

/** Video transcoding runs one job at a time in its own lane, so reminders are never held up by it. */
async function heavyLoop() {
  while (!stopping) {
    try {
      const result = await runDueJobs(1, prisma, { types: HEAVY_JOB_TYPES });
      if (result.claimed > 0)
        console.log(`[worker] heavy job done=${result.done} failed=${result.failed}`);
    } catch (error) {
      console.error("[worker] heavy lane failed", error);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS * 6));
  }
}

async function main() {
  registerJobHandlers();
  console.log(`[worker] started, interval ${INTERVAL_MS}ms`);
  const heavy = heavyLoop();
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await heavy;
  await prisma.$disconnect();
  console.log("[worker] stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
