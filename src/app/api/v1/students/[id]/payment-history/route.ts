import { json, route } from "@/server/http/handler";
import { listStudentPaymentHistory } from "@/server/services/students/history-import.service";

/**
 * Payments a student made in the system the centre used before (A-142),
 * newest first. The site's student page reads them as it is drawn; the app's
 * page asks here (A-241).
 */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await listStudentPaymentHistory(current.actor, params.id)),
);
