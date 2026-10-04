import { leaveReasonSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { deleteLeaveReason, updateLeaveReason } from "@/server/services/reports/churn.service";

const patchSchema = leaveReasonSchema.partial();

export const PATCH = route<typeof patchSchema._output, { id: string }>(
  { permission: "settings.catalog", body: patchSchema },
  async ({ current, body, params }) =>
    json(await updateLeaveReason(current.actor, params.id, body)),
);

export const DELETE = route<undefined, { id: string }>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await deleteLeaveReason(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
