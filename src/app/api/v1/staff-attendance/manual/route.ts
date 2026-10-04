import { manualCheckSchema } from "@/lib/validation/integrations";
import { route } from "@/server/http/handler";
import { setManualCheck } from "@/server/services/attendance/staff-attendance.service";

/** A manager corrects a check-in/out (A-87). */
export const PUT = route<typeof manualCheckSchema._output>(
  { permission: "staff.update", body: manualCheckSchema },
  async ({ current, body }) => {
    await setManualCheck(current.actor, body);
    return new Response(null, { status: 204 });
  },
);
