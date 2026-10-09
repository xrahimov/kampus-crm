import { bulkStudentsSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { bulkStudents } from "@/server/services/students/bulk.service";

/**
 * Bulk actions on the ticked students (A-132): add to a group, give a discount,
 * archive, restore. The service checks the permission the action needs.
 */
export const POST = route<typeof bulkStudentsSchema._output>(
  { body: bulkStudentsSchema },
  async ({ current, body }) => json(await bulkStudents(current.actor, body)),
);
