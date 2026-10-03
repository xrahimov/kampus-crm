import { attendanceSchema } from "@/lib/validation/groups";
import { route } from "@/server/http/handler";
import { markAttendance } from "@/server/services/groups/lessons.service";

export const PUT = route<typeof attendanceSchema._output, { id: string }>(
  { permission: "groups.attendance.mark", body: attendanceSchema },
  async ({ current, body, params }) => {
    await markAttendance(current.actor, params.id, body.marks);
    return new Response(null, { status: 204 });
  },
);
