import { leadFilterSchema, leadSchema } from "@/lib/validation/leads";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { createLead, getBoardView } from "@/server/services/leads/leads.service";

/** The board: `?boardId&q&lessonTime&teacherId&days&archived` (EXP §2 filters). */
export const GET = route({ permission: "leads.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const raw: Record<string, string | undefined> = {};
  for (const key of ["boardId", "q", "lessonTime", "teacherId", "days", "archived"]) {
    raw[key] = params.get(key) ?? undefined;
  }
  const filters = leadFilterSchema.safeParse(raw);
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await getBoardView(current.actor, filters.data));
});

/** "YANGI LID QO'SHISH". */
export const POST = route<typeof leadSchema._output>(
  { permission: "leads.create", body: leadSchema },
  async ({ current, body }) => json(await createLead(current.actor, body), { status: 201 }),
);
