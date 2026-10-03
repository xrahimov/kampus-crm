import { json, route } from "@/server/http/handler";
import { getMonthGrid } from "@/server/services/groups/lessons.service";

/** `?month=YYYY-MM` → lessons of that month with attendance and grades, plus the member rows. */
export const GET = route<undefined, { id: string }>(
  { permission: "groups.view" },
  async ({ current, params, request }) => {
    const month = request.nextUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    return json(await getMonthGrid(current.actor, params.id, month));
  },
);
