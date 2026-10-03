import { leadColumnSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { deleteColumn, updateColumn } from "@/server/services/leads/boards.service";

type Params = { id: string };

export const PATCH = route<typeof leadColumnSchema._output, Params>(
  { permission: "leads.update", body: leadColumnSchema },
  async ({ current, body, params }) => json(await updateColumn(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "leads.update" },
  async ({ current, params }) => {
    await deleteColumn(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
