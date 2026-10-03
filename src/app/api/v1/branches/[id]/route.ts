import { branchUpdateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { deactivateBranch, updateBranch } from "@/server/services/settings/branches.service";

type Params = { id: string };

export const PATCH = route<typeof branchUpdateSchema._output, Params>(
  { permission: "settings.org", body: branchUpdateSchema },
  async ({ current, body, params }) => json(await updateBranch(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.org" },
  async ({ current, params }) => {
    await deactivateBranch(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
