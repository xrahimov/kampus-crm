import { chatMessageSchema, type ChatMessageInput } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { getGroupChat, postGroupMessage } from "@/server/services/chat/group-chat.service";

type Params = { id: string };

/** The group's chat (A-170); `?after=<id>` returns only newer messages. */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params, request }) =>
    json(
      await getGroupChat(current.actor, params.id, {
        after: new URL(request.url).searchParams.get("after"),
      }),
    ),
);

export const POST = route<ChatMessageInput, Params>(
  { permission: "groups.view", body: chatMessageSchema },
  async ({ current, body, params }) =>
    json(await postGroupMessage(current.actor, params.id, body.text), { status: 201 }),
);
