import { JOIN_REQUEST_TABS, type JoinRequestTab } from "@/lib/validation/sign-in";
import { json, route } from "@/server/http/handler";
import { listJoinRequests } from "@/server/services/sign-in/join-requests.service";

/** People waiting to be let in (A-196), for whoever may add students or staff. */
export const GET = route({}, async ({ current, request }) => {
  const asked = request.nextUrl.searchParams.get("status");
  const tab = (JOIN_REQUEST_TABS as readonly string[]).includes(asked ?? "")
    ? (asked as JoinRequestTab)
    : "PENDING";
  return json(await listJoinRequests(current.actor, tab));
});
