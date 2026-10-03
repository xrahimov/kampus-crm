import { membershipUpdateSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { updateMembership } from "@/server/services/groups/memberships.service";

export const PATCH = route<typeof membershipUpdateSchema._output, { id: string }>(
  { permission: "groups.update", body: membershipUpdateSchema },
  async ({ current, body, params }) => json(await updateMembership(current.actor, params.id, body)),
);
