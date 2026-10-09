import { json, route } from "@/server/http/handler";
import { listOwnSessions, revokeOtherSessions } from "@/server/services/account.service";

export const GET = route({}, async ({ current }) =>
  json({ items: await listOwnSessions(current.actor, current.session.id) }),
);

/** "Sign out everywhere else". */
export const DELETE = route({}, async ({ current }) =>
  json({ revoked: await revokeOtherSessions(current.actor, current.session.id) }),
);
