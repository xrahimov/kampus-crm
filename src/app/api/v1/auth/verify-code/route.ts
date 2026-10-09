import { verifyCodeSchema } from "@/lib/validation/auth";
import { setSessionCookies } from "@/server/auth/session";
import { json, route } from "@/server/http/handler";
import { verifySignInCode } from "@/server/services/auth.service";

/** Second step of a sign-in: the code from the Telegram message (A-124). */
export const POST = route(
  { auth: false, body: verifyCodeSchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const issued = await verifySignInCode(body, {
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    await setSessionCookies(issued);
    return json({ ok: true, csrfToken: issued.csrfToken });
  },
);
