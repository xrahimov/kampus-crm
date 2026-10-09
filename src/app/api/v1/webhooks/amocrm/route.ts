import type { NextRequest } from "next/server";

import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { assertWebhookSecret } from "@/server/services/integrations/integrations.service";
import {
  parseAmoCrmWebhook,
  receiveAmoCrmWebhook,
} from "@/server/services/leads/amocrm-inbound.service";

import { presentedSecret } from "../_secret";

/** amoCRM checks that the address answers; it is also the OAuth redirect URI, which Kampus does not use. */
export const GET = route({ auth: false }, async () => json({ ok: true }));

/**
 * amoCRM posts "lead added" here as form fields (A-115); no session, the shared
 * secret in the address names the centre. Only queues the import, so amoCRM
 * gets its answer at once.
 */
export const POST = route({ auth: false, skipCsrf: true }, async ({ request }) => {
  const organizationId = await assertWebhookSecret(prisma, "AMOCRM", presentedSecret(request));
  const hook = parseAmoCrmWebhook(await webhookParams(request));
  return json(await receiveAmoCrmWebhook(prisma, organizationId, hook));
});

/** amoCRM sends `application/x-www-form-urlencoded`; a JSON body is flattened to the same bracket keys. */
async function webhookParams(request: NextRequest): Promise<URLSearchParams> {
  const text = await request.text();
  if (!(request.headers.get("content-type") ?? "").includes("json")) {
    return new URLSearchParams(text);
  }
  const params = new URLSearchParams();
  const walk = (value: unknown, path: string) => {
    if (value !== null && typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}[${k}]` : k);
      }
    } else if (value !== undefined && value !== null) {
      params.append(path, String(value));
    }
  };
  walk(JSON.parse(text || "{}"), "");
  return params;
}
