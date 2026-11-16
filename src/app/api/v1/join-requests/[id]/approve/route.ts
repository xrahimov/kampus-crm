import { joinRequestApproveSchema, type JoinRequestApproveInput } from "@/lib/validation/sign-in";
import { json, route } from "@/server/http/handler";
import { approveJoinRequest } from "@/server/services/sign-in/join-requests.service";

export const POST = route<JoinRequestApproveInput, { id: string }>(
  { body: joinRequestApproveSchema },
  async ({ current, params, body }) => {
    await approveJoinRequest(current.actor, params.id, body);
    return json({ ok: true });
  },
);
