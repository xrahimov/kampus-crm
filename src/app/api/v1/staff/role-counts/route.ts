import { json, route } from "@/server/http/handler";
import { countStaffByRole } from "@/server/services/staff/staff.service";

/** Counts behind the role filter chips (EXP §8 Staff). */
export const GET = route({ permission: "staff.view" }, async ({ current, request }) => {
  const archived = request.nextUrl.searchParams.get("archived") === "true";
  return json(await countStaffByRole(current.actor, archived));
});
