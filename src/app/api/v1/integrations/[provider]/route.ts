import type { NextRequest } from "next/server";

import {
  INTEGRATION_PROVIDERS,
  integrationSchemas,
  type IntegrationProvider,
} from "@/lib/validation/integrations";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import {
  getIntegration,
  updateIntegration,
} from "@/server/services/integrations/integrations.service";

type Params = { provider: string };

function providerOf(raw: string): IntegrationProvider {
  const upper = raw.toUpperCase().replace("-", "_");
  if ((INTEGRATION_PROVIDERS as readonly string[]).includes(upper)) {
    return upper as IntegrationProvider;
  }
  throw AppError.notFound();
}

/** `/integrations/sms|telegram|amocrm|telephony|face-id` (EXP §8 AmoCRM, FaceID; A-83). */
export const GET = route<undefined, Params>(
  { permission: "settings.integrations" },
  async ({ current, params }) =>
    json(await getIntegration(current.actor, providerOf(params.provider))),
);

async function parse(request: NextRequest, provider: IntegrationProvider) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw AppError.validation({ _: ["validation.invalidJson"] });
  }
  const parsed = integrationSchemas[provider].safeParse(raw);
  if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
  return parsed.data;
}

// The body schema depends on the provider in the URL, so it is parsed here.
export const PUT = route<undefined, Params>(
  { permission: "settings.integrations" },
  async ({ current, params, request }) => {
    const provider = providerOf(params.provider);
    const body = await parse(request, provider);
    // Each schema matches its provider; the union is narrowed by `provider` at runtime.
    return json(
      await updateIntegration(
        current.actor,
        provider,
        body as Parameters<typeof updateIntegration<typeof provider>>[2],
      ),
    );
  },
);
