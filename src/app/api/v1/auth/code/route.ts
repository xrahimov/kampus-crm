import { codeRequestSchema } from "@/lib/validation/sign-in";
import { json, route } from "@/server/http/handler";
import { requestSignInCode } from "@/server/services/sign-in/code.service";
import { requestHost } from "@/server/services/student-auth/http";

/** Step one of a sign-in with a Telegram code (A-196): the bot sends it to the phone's chat. */
export const POST = route(
  { auth: false, body: codeRequestSchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const ticket = await requestSignInCode(
      { ...body, host: requestHost(request) },
      { ip, userAgent: request.headers.get("user-agent") },
    );
    return json(ticket);
  },
);
