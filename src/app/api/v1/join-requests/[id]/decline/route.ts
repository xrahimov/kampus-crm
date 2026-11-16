import { json, route } from "@/server/http/handler";
import { declineJoinRequest } from "@/server/services/sign-in/join-requests.service";

export const POST = route<undefined, { id: string }>({}, async ({ current, params }) => {
  await declineJoinRequest(current.actor, params.id);
  return json({ ok: true });
});
