import { loginSchema } from "@/lib/validation/auth";
import { setSessionCookies } from "@/server/auth/session";
import { json, route } from "@/server/http/handler";
import { login } from "@/server/services/auth.service";

export const POST = route(
  { auth: false, body: loginSchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const outcome = await login(body, { ip, userAgent: request.headers.get("user-agent") });
    if (outcome.kind === "challenge") {
      // The password was right; the browser now asks for the Telegram code (A-124).
      return json({
        ok: false,
        challenge: { id: outcome.challengeId, expiresAt: outcome.expiresAt },
      });
    }
    await setSessionCookies(outcome.issued);
    return json({ ok: true, csrfToken: outcome.issued.csrfToken });
  },
);
