import { autoSmsSettingsSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { getAutoSmsSettings, updateAutoSmsSettings } from "@/server/services/sms/auto-sms.service";

/** General settings → "AUTO SMS SOZLAMALARI" (EXP §8). */
export const GET = route({ permission: "settings.org" }, async ({ current }) =>
  json(await getAutoSmsSettings(current.actor)),
);

export const PUT = route<typeof autoSmsSettingsSchema._output>(
  { permission: "settings.org", body: autoSmsSettingsSchema },
  async ({ current, body }) => json(await updateAutoSmsSettings(current.actor, body)),
);
