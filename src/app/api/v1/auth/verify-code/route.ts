import { verifyCodeSchema } from "@/lib/validation/auth";
import { isAppRequest } from "@/server/auth/app-client";
import { setSessionCookies } from "@/server/auth/session";
import { json, route } from "@/server/http/handler";
import { verifySignInCode } from "@/server/services/auth.service";

/** Second step of a sign-in: the code from the Telegram message (A-124). */
export const POST = route(
  { auth: false, body: verifyCodeSchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const app = isAppRequest(request);
    const issued = await verifySignInCode(body, {
      ip,
      userAgent: request.headers.get("user-agent"),
      app,
    });
    // The phone app keeps no cookies: it gets the token itself (A-203).
    if (app) return json({ ok: true, to: "staff", token: issued.token });
    await setSessionCookies(issued);
    return json({ ok: true, csrfToken: issued.csrfToken });
  },
);
