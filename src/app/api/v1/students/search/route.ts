import { json, route } from "@/server/http/handler";
import { searchStudents } from "@/server/services/groups/memberships.service";

/** `?q=` autocomplete for adding a student to a group. */
export const GET = route({ permission: "groups.update" }, async ({ current, request }) =>
  json(await searchStudents(current.actor, request.nextUrl.searchParams.get("q") ?? "")),
);
