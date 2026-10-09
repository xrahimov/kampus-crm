import { json, route } from "@/server/http/handler";
import { deleteAdjustment } from "@/server/services/students/adjustments.service";

/** Removes an opening balance or correction; undoing money needs the refund permission. */
export const DELETE = route<undefined, { id: string }>(
  { permission: "payments.refund" },
  async ({ current, params }) => {
    await deleteAdjustment(current.actor, params.id);
    return json({ ok: true });
  },
);
