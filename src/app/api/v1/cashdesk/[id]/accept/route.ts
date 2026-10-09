import { json, route } from "@/server/http/handler";
import { acceptCashClose } from "@/server/services/finance/cash-close.service";

type Params = { id: string };

/** The hand-over: a manager accepts a cashier's day close (A-122). */
export const POST = route<undefined, Params>(
  { permission: "finance.update" },
  async ({ current, params }) => json(await acceptCashClose(current.actor, params.id)),
);
