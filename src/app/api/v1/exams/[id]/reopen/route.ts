import { json, route } from "@/server/http/handler";
import { setExamStatus } from "@/server/services/exams/exams.service";

export const POST = route<undefined, { id: string }>(
  { permission: "exams.update" },
  async ({ current, params }) => json(await setExamStatus(current.actor, params.id, "NOT_STARTED")),
);
