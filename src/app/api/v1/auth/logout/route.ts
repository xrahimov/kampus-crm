import { clearSessionCookies } from "@/server/auth/session";
import { json, route } from "@/server/http/handler";
import { logout } from "@/server/services/auth.service";

export const POST = route({}, async ({ current }) => {
  await logout(current.session.id);
  await clearSessionCookies();
  return json({ ok: true });
});
