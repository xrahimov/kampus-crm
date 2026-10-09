import { json, route } from "@/server/http/handler";
import { sendDebtReminder } from "@/server/services/debts/debts.service";

type Params = { id: string };

/** "Send a Telegram reminder" from a debtor row (A-112). */
export const POST = route<undefined, Params>(
  { permission: "payments.create" },
  async ({ current, params }) => json(await sendDebtReminder(current.actor, params.id)),
);
