import { refundSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { refundPayment } from "@/server/services/students/payments.service";

/** "Pul qaytarish". */
export const POST = route<typeof refundSchema._output, { id: string }>(
  { permission: "payments.refund", body: refundSchema },
  async ({ current, body, params }) =>
    json(await refundPayment(current.actor, params.id, body), { status: 201 }),
);
