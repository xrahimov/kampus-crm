import { staffViewSchema } from "@/lib/validation/auth";
import { json, route } from "@/server/http/handler";
import { setStaffView } from "@/server/services/auth.service";

/** The header's view switch (A-194): the person's own choice, kept on their account. */
export const POST = route({ body: staffViewSchema }, async ({ current, body }) => {
  await setStaffView(current.actor.userId, body.view);
  return json({ ok: true, view: body.view });
});
