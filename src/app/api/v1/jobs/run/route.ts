import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { ensureDailyJob, HEAVY_JOB_TYPES, registerJobHandlers } from "@/server/jobs/handlers";
import { runDueJobs } from "@/server/jobs/queue";

/**
 * One pass over the job queue (A-21), for deployments without the worker
 * process or for a cron that pings it. Also queues today's daily scan.
 */
export const POST = route({ permission: "settings.integrations" }, async () => {
  registerJobHandlers();
  await ensureDailyJob(prisma);
  // Video transcoding takes an hour; it is the worker's, never a request's.
  const result = await runDueJobs(50, prisma, { exclude: HEAVY_JOB_TYPES });
  const pending = await prisma.job.count({ where: { status: "PENDING" } });
  return json({ ...result, pending });
});
