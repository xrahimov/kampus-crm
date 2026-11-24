import { json, route } from "@/server/http/handler";
import { getTimetable } from "@/server/services/groups/clashes.service";

/**
 * `?mode=room|teacher&branchId=&id=`: one room's or one teacher's week (A-116),
 * for the app's Timetable (A-233). The site draws the same from its page.
 */
export const GET = route({ permission: "groups.view" }, async ({ current, request }) => {
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode");
  return json(
    await getTimetable(current.actor, {
      mode: mode === "teacher" || mode === "room" ? mode : undefined,
      branchId: params.get("branchId") ?? undefined,
      id: params.get("id") ?? undefined,
    }),
  );
});
