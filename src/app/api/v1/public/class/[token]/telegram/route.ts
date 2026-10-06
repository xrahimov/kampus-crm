import { json, route } from "@/server/http/handler";
import { getPortalTelegram } from "@/server/services/telegram/student-telegram.service";

type Params = { token: string };

/** The student's Telegram state: the connect link and the chats already linked. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const state = await getPortalTelegram(params.token);
  return state ? json(state) : new Response(null, { status: 404 });
});
