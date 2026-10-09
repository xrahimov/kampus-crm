import { route } from "@/server/http/handler";
import { revokeOwnSession } from "@/server/services/account.service";

type Params = { id: string };

export const DELETE = route<undefined, Params>({}, async ({ current, params }) => {
  await revokeOwnSession(current.actor, current.session.id, params.id);
  return new Response(null, { status: 204 });
});
