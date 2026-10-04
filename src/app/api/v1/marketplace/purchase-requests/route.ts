import { purchaseFilterSchema, purchaseRequestSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import {
  createPurchaseRequest,
  listPurchaseRequests,
} from "@/server/services/coins/marketplace.service";

import { parseQuery } from "../../finance/_query";

/** "XARID SO'ROVLARI" (EXP §10); `?status=` filter. */
export const GET = route({}, async ({ current, request }) =>
  json(
    await listPurchaseRequests(
      current.actor,
      parseQuery(request, ["status"], purchaseFilterSchema),
    ),
  ),
);

/** Staff files a request on a student's behalf (A-80). */
export const POST = route<typeof purchaseRequestSchema._output>(
  { permission: "coins.manage", body: purchaseRequestSchema },
  async ({ current, body }) =>
    json(await createPurchaseRequest(current.actor, body), { status: 201 }),
);
