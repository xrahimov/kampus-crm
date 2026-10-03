import { activeBranchSchema } from "@/lib/validation/auth";
import { json, route } from "@/server/http/handler";
import { setActiveBranch } from "@/server/services/auth.service";

export const POST = route({ body: activeBranchSchema }, async ({ current, body }) => {
  await setActiveBranch(current.actor, current.session.id, body.branchId);
  return json({ ok: true });
});
