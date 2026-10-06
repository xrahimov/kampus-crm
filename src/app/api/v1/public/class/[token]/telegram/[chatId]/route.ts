import { assertSameOrigin } from "@/server/auth/csrf";
import { route } from "@/server/http/handler";
import { unlinkPortalChat } from "@/server/services/telegram/student-telegram.service";

type Params = { token: string; chatId: string };

/** The student removes one linked Telegram chat from their page. */
export const DELETE = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    await unlinkPortalChat(params.token, params.chatId);
    return new Response(null, { status: 204 });
  },
);
