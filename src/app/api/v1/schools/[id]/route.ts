import { schoolUpdateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { deleteSchool, updateSchool } from "@/server/services/settings/schools.service";

type Params = { id: string };

export const PATCH = route<typeof schoolUpdateSchema._output, Params>(
  { permission: "settings.catalog", body: schoolUpdateSchema },
  async ({ current, body, params }) => json(await updateSchool(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await deleteSchool(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
