import { examFilterSchema, examSchema } from "@/lib/validation/exams";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { createExam, listExams } from "@/server/services/exams/exams.service";

/** `?type=GROUP|MOCK&status&groupId&from&to` (EXP §7 tabs and filters). */
export const GET = route({ permission: "exams.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const raw: Record<string, string | undefined> = {};
  for (const key of ["type", "status", "groupId", "from", "to"]) {
    raw[key] = params.get(key) ?? undefined;
  }
  const filters = examFilterSchema.safeParse(raw);
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listExams(current.actor, filters.data));
});

/** "Imtihon qo'shish". */
export const POST = route<typeof examSchema._output>(
  { permission: "exams.create", body: examSchema },
  async ({ current, body }) => json(await createExam(current.actor, body), { status: 201 }),
);
