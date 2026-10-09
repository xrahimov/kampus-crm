import { changePasswordSchema } from "@/lib/validation/auth";
import { json, route } from "@/server/http/handler";
import { changePassword } from "@/server/services/account.service";

export const POST = route<typeof changePasswordSchema._output>(
  { body: changePasswordSchema },
  async ({ current, body }) => {
    await changePassword(current.actor, current.session.id, body);
    return json({ ok: true });
  },
);
