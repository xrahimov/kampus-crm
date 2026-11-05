import { callAttendanceSchema, type CallAttendanceInput } from "@/lib/validation/video";
import { json, route } from "@/server/http/handler";
import {
  applyCallAttendance,
  getCallAttendance,
} from "@/server/services/video/call-attendance.service";

type Params = { id: string };

/** The marks a call suggests for its lesson (online-lessons B1). */
export const GET = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => json(await getCallAttendance(current.actor, params.id)),
);

/** Writes the marks the teacher confirmed. */
export const POST = route<CallAttendanceInput, Params>(
  { permission: "groups.attendance.mark", body: callAttendanceSchema },
  async ({ current, params, body }) => {
    await applyCallAttendance(current.actor, params.id, body.marks);
    return new Response(null, { status: 204 });
  },
);
