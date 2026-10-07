import { prisma } from "@/server/db/prisma";

/**
 * The seeded demo centre (prisma/seed.ts) every DB-backed test runs inside.
 * Hand-built actors need its id, and an actor who sees every branch needs the
 * branch list a real login would carry (A-108), so tests refresh it after they
 * create their branches.
 */
export const DEMO_ORG_ID = "org_demo";

/** Every branch of the demo centre, including the ones other test files just created. */
export async function demoBranchIds(): Promise<string[]> {
  const rows = await prisma.branch.findMany({
    where: { organizationId: DEMO_ORG_ID },
    select: { id: true },
  });
  return rows.map((b) => b.id);
}
