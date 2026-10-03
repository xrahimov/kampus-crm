import { json, route } from "@/server/http/handler";
import { getStudentOptions } from "@/server/services/students/students.service";

/** Schools, sources, courses, groups, teachers and payment methods for the student forms. */
export const GET = route({ permission: "students.view" }, async ({ current }) =>
  json(await getStudentOptions(current.actor)),
);
