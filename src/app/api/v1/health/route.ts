import { prisma } from "@/server/db/prisma";
import { errorResponse, json } from "@/server/http/handler";
import { maybeRunMonitoring } from "@/server/services/system/monitoring.service";

/**
 * Liveness + database check for Docker and CI. Docker polls it every 30 s, which
 * also clocks the monitoring pass (A-134): at most one every five minutes, run
 * after the answer goes out.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    maybeRunMonitoring(prisma);
    return json({ status: "ok" });
  } catch (error) {
    return errorResponse(error, "/api/v1/health");
  }
}
