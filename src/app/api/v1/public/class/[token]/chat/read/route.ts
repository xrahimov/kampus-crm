import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { markPortalChatRead } from "@/server/services/chat/group-chat.service";

type Params = { token: string };

/** The student opened the chat (A-170). */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const result = await markPortalChatRead(params.token);
    return result ? json(result) : new Response(null, { status: 404 });
  },
);
