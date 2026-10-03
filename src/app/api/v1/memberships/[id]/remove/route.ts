import { leaveSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { updateMembership } from "@/server/services/groups/memberships.service";

/** "Guruhdan chiqarish", with an optional leave reason (EXP §10 churn report). */
export const POST = route<typeof leaveSchema._output, { id: string }>(
  { permission: "groups.update", body: leaveSchema },
  async ({ current, body, params }) =>
    json(
      await updateMembership(current.actor, params.id, {
        status: "ARCHIVED",
        leaveReason: body.reason ?? null,
      }),
    ),
);
