/**
 * Background worker (A-21): claims due jobs from the Postgres queue and runs
 * them. Start with `npm run worker`; the docker-compose `worker` service runs it
 * next to the app. Stops cleanly on SIGINT/SIGTERM.
 *
 * Without a worker, POST /api/v1/jobs/run (settings.integrations) does one pass.
 */
import "dotenv/config";

import { prisma } from "../src/server/db/prisma";
import { ensureDailyJob, registerJobHandlers } from "../src/server/jobs/handlers";
import { runDueJobs } from "../src/server/jobs/queue";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 5000);
let stopping = false;

async function tick() {
  try {
    await ensureDailyJob(prisma);
    const result = await runDueJobs(20, prisma);
    if (result.claimed > 0) {
      console.log(`[worker] claimed=${result.claimed} done=${result.done} failed=${result.failed}`);
    }
  } catch (error) {
    console.error("[worker] tick failed", error);
  }
}

async function main() {
  registerJobHandlers();
  console.log(`[worker] started, interval ${INTERVAL_MS}ms`);
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  await prisma.$disconnect();
  console.log("[worker] stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

void main();
