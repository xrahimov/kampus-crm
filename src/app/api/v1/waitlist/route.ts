import {
  WAITLIST_SORT_FIELDS,
  waitlistEntrySchema,
  waitlistFilterSchema,
} from "@/lib/validation/leads";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import { createWaitlistEntry, listWaitlist } from "@/server/services/leads/waitlist.service";

/** The waiting list (A-138): `?courseId&status&q&sort&page`; open entries by default, oldest first. */
export const GET = route({ permission: "leads.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: WAITLIST_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "asc" },
  });
  const filters = waitlistFilterSchema.safeParse({
    courseId: params.get("courseId") ?? undefined,
    status: params.get("status") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listWaitlist(current.actor, query, filters.data));
});

export const POST = route<typeof waitlistEntrySchema._output>(
  { permission: "leads.create", body: waitlistEntrySchema },
  async ({ current, body }) =>
    json(await createWaitlistEntry(current.actor, body), { status: 201 }),
);
