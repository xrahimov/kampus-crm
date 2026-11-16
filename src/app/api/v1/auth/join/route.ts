import { joinRequestSendSchema } from "@/lib/validation/sign-in";
import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { organizationForHost } from "@/server/services/settings/domains.service";
import { sendJoinRequest } from "@/server/services/sign-in/join-requests.service";
import { requestHost } from "@/server/services/student-auth/http";

/**
 * Someone whose phone Kampus does not know asks to be let in (A-196). The
 * token came with the Telegram code check, so only a proven phone can ask.
 */
export const POST = route(
  { auth: false, body: joinRequestSendSchema, skipCsrf: true },
  async ({ body, request }) => {
    const brand = await organizationForHost(requestHost(request));
    return json({ join: await sendJoinRequest(prisma, body, brand?.organizationId ?? null) });
  },
);
