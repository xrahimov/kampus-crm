import { workScheduleSchema } from "@/lib/validation/integrations";
import { route } from "@/server/http/handler";
import { setWorkSchedule } from "@/server/services/attendance/staff-attendance.service";

/** "Ish jadvallari": replaces one staff member's weekly schedule. */
export const PUT = route<typeof workScheduleSchema._output>(
  { permission: "staff.update", body: workScheduleSchema },
  async ({ current, body }) => {
    await setWorkSchedule(current.actor, body);
    return new Response(null, { status: 204 });
  },
);
