import { giveCoinsSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { giveCoins } from "@/server/services/coins/coins.service";

/** "COIN BERISH" (EXP §5 COINLAR). */
export const POST = route<typeof giveCoinsSchema._output>(
  { permission: "coins.give", body: giveCoinsSchema },
  async ({ current, body }) => json(await giveCoins(current.actor, body), { status: 201 }),
);
