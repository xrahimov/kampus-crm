import { inboxCloseSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { getConversation, setConversationClosed } from "@/server/services/leads/inbox.service";

type Params = { id: string };

/** One chat with its messages; reading it clears the unread mark. */
export const GET = route<undefined, Params>(
  { permission: "leads.view" },
  async ({ current, params }) => json(await getConversation(current.actor, params.id)),
);

/** Close or reopen the chat. */
export const PATCH = route<typeof inboxCloseSchema._output, Params>(
  { permission: "leads.update", body: inboxCloseSchema },
  async ({ current, params, body }) =>
    json(await setConversationClosed(current.actor, params.id, body)),
);
