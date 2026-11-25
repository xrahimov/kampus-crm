import { reviewSignInRemoveSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { removeReviewSignIn } from "@/server/services/settings/review-sign-ins.service";

/* Site owner only (A-272): ends a reviewer's sign-in. */

export const POST = route({ body: reviewSignInRemoveSchema }, async ({ current, body }) => {
  await removeReviewSignIn(current.actor, body.kind, body.id);
  return json({ ok: true });
});
