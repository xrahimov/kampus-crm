import { roleUpdateSchema } from "@/lib/validation/staff";
import { json, route } from "@/server/http/handler";
import { deleteRole, updateRole } from "@/server/services/staff/roles.service";

type Params = { id: string };

export const PATCH = route<typeof roleUpdateSchema._output, Params>(
  { permission: "settings.roles", body: roleUpdateSchema },
  async ({ current, body, params }) => json(await updateRole(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.roles" },
  async ({ current, params }) => {
    await deleteRole(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
