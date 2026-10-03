import { prisma } from "@/server/db/prisma";
import { errorResponse, json } from "@/server/http/handler";

/** Liveness + database check for Docker and CI. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return json({ status: "ok" });
  } catch (error) {
    return errorResponse(error);
  }
}
