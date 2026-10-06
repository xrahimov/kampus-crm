import { materialSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { addMaterial, listGroupMaterials } from "@/server/services/materials/materials.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupMaterials(current.actor, params.id)),
);

/** Adds a file (uploaded through /uploads/documents first) or a link. */
export const POST = route<typeof materialSchema._output, Params>(
  { permission: "groups.attendance.mark", body: materialSchema },
  async ({ current, body, params }) =>
    json(await addMaterial(current.actor, params.id, body), { status: 201 }),
);
