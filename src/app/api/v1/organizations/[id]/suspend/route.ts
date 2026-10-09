import { organizationSuspendSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { setOrganizationSuspended } from "@/server/services/settings/owner-console.service";

/** Site owner only (A-144): suspends or resumes a centre; the service checks the flag. */
export const POST = route<Parameters<typeof setOrganizationSuspended>[2], { id: string }>(
  { body: organizationSuspendSchema },
  async ({ current, params, body }) =>
    json(await setOrganizationSuspended(current.actor, params.id, body)),
);
