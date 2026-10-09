import { inboxReplySchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { replyToConversation } from "@/server/services/leads/inbox.service";

type Params = { id: string };

/** A manager's answer, sent through the centre's bot. */
export const POST = route<typeof inboxReplySchema._output, Params>(
  { permission: "leads.update", body: inboxReplySchema },
  async ({ current, params, body }) =>
    json(await replyToConversation(current.actor, params.id, body), { status: 201 }),
);
