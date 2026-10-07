import { organizationCreateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import {
  createOrganization,
  listOrganizations,
} from "@/server/services/settings/organizations.service";

/* Site owner only (A-108); the service checks the flag, since no role grants it. */

export const GET = route({}, async ({ current }) => json(await listOrganizations(current.actor)));

export const POST = route({ body: organizationCreateSchema }, async ({ current, body }) =>
  json(await createOrganization(current.actor, body), { status: 201 }),
);
