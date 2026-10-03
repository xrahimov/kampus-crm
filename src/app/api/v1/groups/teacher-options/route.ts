import { json, route } from "@/server/http/handler";
import { listTeacherOptions } from "@/server/services/groups/groups.service";

/** `?branchId=` → teachers the group form may pick. */
export const GET = route({ permission: "groups.view" }, async ({ current, request }) => {
  const branchId = request.nextUrl.searchParams.get("branchId") ?? "";
  return json(await listTeacherOptions(current.actor, branchId));
});
