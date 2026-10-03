import { orgSettingsSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { getOrgSettings, updateOrgSettings } from "@/server/services/settings/org-settings.service";

export const GET = route({ permission: "settings.org" }, async ({ current }) =>
  json(await getOrgSettings(current.actor)),
);

export const PUT = route(
  { permission: "settings.org", body: orgSettingsSchema },
  async ({ current, body }) => json(await updateOrgSettings(current.actor, body)),
);
