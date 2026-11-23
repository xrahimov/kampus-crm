import { bearerToken } from "@/server/auth/app-client";
import { clearSessionCookies } from "@/server/auth/session";
import { json, route } from "@/server/http/handler";
import { logout } from "@/server/services/auth.service";

export const POST = route({}, async ({ current, request }) => {
  await logout(current.session.id);
  // The phone app holds its token itself and has no cookies to clear (A-203).
  if (!bearerToken(request)) await clearSessionCookies();
  return json({ ok: true });
});
