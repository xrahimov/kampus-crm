import { coinSettingsSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { getCoinSettings, updateCoinSettings } from "@/server/services/coins/coins.service";

/** Settings → "Coin sozlamalari": the automatic switch and rules (EXP §8). */
export const GET = route({}, async ({ current }) => json(await getCoinSettings(current.actor)));

export const PUT = route<typeof coinSettingsSchema._output>(
  { permission: "settings.org", body: coinSettingsSchema },
  async ({ current, body }) => json(await updateCoinSettings(current.actor, body)),
);
