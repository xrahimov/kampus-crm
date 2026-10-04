import { json, route } from "@/server/http/handler";
import { getExamOptions } from "@/server/services/exams/exams.service";

/** Groups, courses, rooms, grading systems and examiners for the exam drawer. */
export const GET = route({ permission: "exams.view" }, async ({ current }) =>
  json(await getExamOptions(current.actor)),
);
