import { json, route } from "@/server/http/handler";
import { setExamStatus } from "@/server/services/exams/exams.service";

/** Moves the exam to the "Yakunlangan" tab. */
export const POST = route<undefined, { id: string }>(
  { permission: "exams.update" },
  async ({ current, params }) => json(await setExamStatus(current.actor, params.id, "FINISHED")),
);
