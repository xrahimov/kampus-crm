import { purchaseDecisionSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { decidePurchaseRequest } from "@/server/services/coins/marketplace.service";

type Params = { id: string };

/** Approve (spend coins, decrement stock) or reject. */
export const PATCH = route<typeof purchaseDecisionSchema._output, Params>(
  { permission: "coins.manage", body: purchaseDecisionSchema },
  async ({ current, body, params }) =>
    json(await decidePurchaseRequest(current.actor, params.id, body)),
);
