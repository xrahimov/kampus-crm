import { accountSchema } from "@/lib/validation/auth";
import { json, route } from "@/server/http/handler";
import { getAccount, setOwnSignInCode } from "@/server/services/account.service";

export const GET = route({}, async ({ current }) => json(await getAccount(current.actor)));

export const PATCH = route<typeof accountSchema._output>(
  { body: accountSchema },
  async ({ current, body }) => json(await setOwnSignInCode(current.actor, body.signInCode)),
);
