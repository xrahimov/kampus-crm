import { json, route } from "@/server/http/handler";
import { getStudentProgress } from "@/server/services/exams/exams.service";

/** Student profile → Progress tab. */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await getStudentProgress(current.actor, params.id)),
);
