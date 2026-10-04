import { financeEntrySchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { deleteEntry, updateEntry } from "@/server/services/finance/entries.service";

type Params = { id: string };

export const PATCH = route<typeof financeEntrySchema._output, Params>(
  { permission: "finance.update", body: financeEntrySchema },
  async ({ current, body, params }) => json(await updateEntry(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "finance.delete" },
  async ({ current, params }) => {
    await deleteEntry(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
