import { json, route } from "@/server/http/handler";
import { markGroupChatRead } from "@/server/services/chat/group-chat.service";

type Params = { id: string };

/** The reader opened the group's chat (A-170). */
export const POST = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => {
    await markGroupChatRead(current.actor, params.id);
    return json({ ok: true });
  },
);
