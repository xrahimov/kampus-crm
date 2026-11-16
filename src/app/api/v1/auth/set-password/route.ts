import { setPasswordSchema } from "@/lib/validation/sign-in";
import { json, route } from "@/server/http/handler";
import { setOwnPassword } from "@/server/services/sign-in/password.service";

/** A password of one's own, chosen in a session a Telegram code opened (A-196). */
export const POST = route<typeof setPasswordSchema._output>(
  { body: setPasswordSchema },
  async ({ current, body }) => {
    await setOwnPassword(current.actor, current.session.id, body.newPassword);
    return json({ ok: true });
  },
);
