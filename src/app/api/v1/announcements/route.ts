import {
  ANNOUNCEMENT_SORT_FIELDS,
  announcementFilterSchema,
  announcementSchema,
} from "@/lib/validation/announcements";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors, parseListQuery } from "@/server/http/list-query";
import {
  createAnnouncement,
  listAnnouncements,
} from "@/server/services/announcements/announcements.service";

/** Announcements (A-129): `?audience&branchId&groupId&q&sort&page`, newest first. */
export const GET = route({ permission: "announcements.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const query = parseListQuery(params, {
    sortable: ANNOUNCEMENT_SORT_FIELDS,
    defaultSort: { field: "createdAt", direction: "desc" },
  });
  const filters = announcementFilterSchema.safeParse({
    audience: params.get("audience") ?? undefined,
    branchId: params.get("branchId") ?? undefined,
    groupId: params.get("groupId") ?? undefined,
  });
  if (!filters.success) throw AppError.validation(fieldErrors(filters.error.issues));
  return json(await listAnnouncements(current.actor, query, filters.data));
});

/** Post once: the page, Telegram and, if asked, SMS. */
export const POST = route<typeof announcementSchema._output>(
  { permission: "announcements.create", body: announcementSchema },
  async ({ current, body }) => json(await createAnnouncement(current.actor, body), { status: 201 }),
);
