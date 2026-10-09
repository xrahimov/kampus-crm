import { json, route } from "@/server/http/handler";
import { listStudentAdjustments } from "@/server/services/students/adjustments.service";

/** Opening balances and corrections of one student, newest first (A-109). */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await listStudentAdjustments(current.actor, params.id)),
);
