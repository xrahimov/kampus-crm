import { json, route } from "@/server/http/handler";
import { deleteLegacyPayment } from "@/server/services/students/history-import.service";

type Params = { id: string };

/** Removes a wrongly imported payment-history row (A-142). */
export const DELETE = route<undefined, Params>(
  { permission: "payments.refund" },
  async ({ current, params }) => {
    await deleteLegacyPayment(current.actor, params.id);
    return json({ ok: true });
  },
);
