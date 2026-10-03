import { moveBranchSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { moveGroupBranch } from "@/server/services/groups/groups.service";

export const POST = route<typeof moveBranchSchema._output, { id: string }>(
  { permission: "groups.update", body: moveBranchSchema },
  async ({ current, body, params }) =>
    json(await moveGroupBranch(current.actor, params.id, body.branchId)),
);
