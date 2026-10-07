import { organizationUpdateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { updateOrganization } from "@/server/services/settings/organizations.service";

export const PATCH = route<Parameters<typeof updateOrganization>[2], { id: string }>(
  { body: organizationUpdateSchema },
  async ({ current, params, body }) =>
    json(await updateOrganization(current.actor, params.id, body)),
);
