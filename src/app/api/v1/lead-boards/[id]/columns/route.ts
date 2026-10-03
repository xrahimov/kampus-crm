import { leadColumnSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { createColumn } from "@/server/services/leads/boards.service";

/** "QO'SHIMCHA USTUN QO'SHISH". */
export const POST = route<typeof leadColumnSchema._output, { id: string }>(
  { permission: "leads.update", body: leadColumnSchema },
  async ({ current, body, params }) =>
    json(await createColumn(current.actor, params.id, body), { status: 201 }),
);
