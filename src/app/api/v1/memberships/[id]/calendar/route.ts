import { json, route } from "@/server/http/handler";
import { getMembershipCalendar } from "@/server/services/students/students.service";

/** "Darslar taqvimi" on the student's group card: `?month=YYYY-MM-01`. */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params, request }) =>
    json(
      await getMembershipCalendar(
        current.actor,
        params.id,
        request.nextUrl.searchParams.get("month"),
      ),
    ),
);
