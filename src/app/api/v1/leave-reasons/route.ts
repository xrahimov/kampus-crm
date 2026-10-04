import { leaveReasonSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { createLeaveReason, listLeaveReasons } from "@/server/services/reports/churn.service";

/** "SABABLARNI SOZLASH" (EXP §10 churn report): the reasons offered when a student leaves or moves. */
export const GET = route({ permission: "groups.view" }, async ({ current }) =>
  json(await listLeaveReasons(current.actor)),
);

export const POST = route<typeof leaveReasonSchema._output>(
  { permission: "settings.catalog", body: leaveReasonSchema },
  async ({ current, body }) => json(await createLeaveReason(current.actor, body), { status: 201 }),
);
