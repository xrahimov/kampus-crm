import { leadSourceSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { deleteSource, updateSource } from "@/server/services/leads/sources.service";

type Params = { id: string };
const patchSchema = leadSourceSchema.partial();

export const PATCH = route<typeof patchSchema._output, Params>(
  { permission: "leads.update", body: patchSchema },
  async ({ current, body, params }) => json(await updateSource(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "leads.delete" },
  async ({ current, params }) => {
    await deleteSource(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
