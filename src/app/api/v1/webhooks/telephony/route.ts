import { telephonyWebhookSchema } from "@/lib/validation/integrations";
import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { recordWebhookCall } from "@/server/services/calls/calls.service";
import { assertWebhookSecret } from "@/server/services/integrations/integrations.service";

import { presentedSecret } from "../_secret";

/** A PBX posts finished calls here (A-86); no session, the shared secret authorises it. */
export const POST = route<typeof telephonyWebhookSchema._output>(
  { auth: false, body: telephonyWebhookSchema, skipCsrf: true },
  async ({ request, body }) => {
    const organizationId = await assertWebhookSecret(prisma, "TELEPHONY", presentedSecret(request));
    return json(await recordWebhookCall(prisma, organizationId, body), { status: 201 });
  },
);
