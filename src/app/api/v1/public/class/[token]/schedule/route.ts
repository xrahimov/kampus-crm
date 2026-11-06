import { json, route } from "@/server/http/handler";
import { getPortalSchedule } from "@/server/services/portal/reschedule.service";

type Params = { token: string };

/** Upcoming lessons with the move/cancel window, and lessons waiting for a new time (A-166). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const schedule = await getPortalSchedule(params.token);
  return schedule ? json(schedule) : new Response(null, { status: 404 });
});
