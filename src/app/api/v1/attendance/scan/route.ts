import { attendanceScanSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { scanAttendance } from "@/server/services/groups/scan.service";

/** A scanned badge marks the student present (A-139): on the given lesson, else on their lesson of the day. */
export const POST = route<typeof attendanceScanSchema._output>(
  { permission: "groups.attendance.mark", body: attendanceScanSchema },
  async ({ current, body }) => json(await scanAttendance(current.actor, body)),
);
