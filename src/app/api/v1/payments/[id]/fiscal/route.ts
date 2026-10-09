import { json, route } from "@/server/http/handler";
import { issueFiscalReceiptNow } from "@/server/services/payments/fiscal.service";

type Params = { id: string };

/** "Issue fiscal receipt" / "Retry" on a payment (A-147): sent to the provider at once. */
export const POST = route<undefined, Params>(
  { permission: "payments.create" },
  async ({ current, params }) => json(await issueFiscalReceiptNow(current.actor, params.id)),
);
