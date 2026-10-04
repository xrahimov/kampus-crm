import { json, route } from "@/server/http/handler";
import { listGroupCoins } from "@/server/services/coins/coins.service";

type Params = { id: string };

/** Group → COINLAR tab (EXP §5): ranking by balance. */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupCoins(current.actor, params.id)),
);
