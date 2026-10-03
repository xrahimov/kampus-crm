import { staffUpdateSchema } from "@/lib/validation/staff";
import { json, route } from "@/server/http/handler";
import { archiveStaff, getStaff, updateStaff } from "@/server/services/staff/staff.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "staff.view" },
  async ({ current, params }) => json(await getStaff(current.actor, "staff", params.id)),
);

export const PATCH = route<typeof staffUpdateSchema._output, Params>(
  { permission: "staff.update", body: staffUpdateSchema },
  async ({ current, body, params }) =>
    json(await updateStaff(current.actor, "staff", params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "staff.delete" },
  async ({ current, params }) => {
    await archiveStaff(current.actor, "staff", params.id);
    return new Response(null, { status: 204 });
  },
);
