import { roleSchema } from "@/lib/validation/staff";
import { json, route } from "@/server/http/handler";
import { createRole, listRoles } from "@/server/services/staff/roles.service";

export const GET = route({}, async ({ current }) => json(await listRoles(current.actor)));

export const POST = route(
  { permission: "settings.roles", body: roleSchema },
  async ({ current, body }) => json(await createRole(current.actor, body), { status: 201 }),
);
