import { reviewSignInSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import {
  listReviewSignIns,
  setReviewSignIn,
} from "@/server/services/settings/review-sign-ins.service";

/* Site owner only (A-272): the sign-ins made for app store reviewers; the service checks the flag. */

export const GET = route({}, async ({ current }) => json(await listReviewSignIns(current.actor)));

export const POST = route({ body: reviewSignInSchema }, async ({ current, body }) =>
  json(await setReviewSignIn(current.actor, body)),
);
