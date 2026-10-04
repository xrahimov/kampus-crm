import { coinReasonSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { deleteCoinReason, updateCoinReason } from "@/server/services/coins/coins.service";

type Params = { id: string };

export const PATCH = route<typeof coinReasonSchema._output, Params>(
  { permission: "settings.org", body: coinReasonSchema },
  async ({ current, body, params }) => json(await updateCoinReason(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.org" },
  async ({ current, params }) => {
    await deleteCoinReason(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
