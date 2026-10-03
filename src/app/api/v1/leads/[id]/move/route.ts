import { leadMoveSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { moveLead } from "@/server/services/leads/leads.service";

/** Drag and drop between columns. */
export const POST = route<typeof leadMoveSchema._output, { id: string }>(
  { permission: "leads.update", body: leadMoveSchema },
  async ({ current, body, params }) => json(await moveLead(current.actor, params.id, body)),
);
