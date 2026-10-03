import { loginSchema } from "@/lib/validation/auth";
import { setSessionCookies } from "@/server/auth/session";
import { json, route } from "@/server/http/handler";
import { login } from "@/server/services/auth.service";

export const POST = route(
  { auth: false, body: loginSchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const issued = await login(body, { ip, userAgent: request.headers.get("user-agent") });
    await setSessionCookies(issued);
    return json({ ok: true, csrfToken: issued.csrfToken });
  },
);
