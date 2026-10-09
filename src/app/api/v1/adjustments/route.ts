import { adjustmentSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { createAdjustment } from "@/server/services/students/adjustments.service";

/** "Qoldiqni to'g'rilash": an opening balance or a correction on one membership (A-109). */
export const POST = route(
  { permission: "payments.create", body: adjustmentSchema },
  async ({ current, body }) => json(await createAdjustment(current.actor, body), { status: 201 }),
);
