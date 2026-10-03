import { branchSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { createBranch, listBranches } from "@/server/services/settings/branches.service";

export const GET = route({}, async ({ current }) =>
  json({ items: await listBranches(current.actor) }),
);

export const POST = route(
  { permission: "settings.org", body: branchSchema },
  async ({ current, body }) => json(await createBranch(current.actor, body), { status: 201 }),
);
