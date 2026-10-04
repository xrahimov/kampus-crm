import { scheduleSchema } from "@/lib/validation/dashboard";
import { json, route } from "@/server/http/handler";
import { getDashboardSchedule } from "@/server/services/dashboard/schedule.service";

import { parseQuery } from "../../finance/_query";

/** Rooms × time slots for one weekday (EXP §1): `?branchId&weekday=1..7&step=30|60`. */
export const GET = route({ permission: "dashboard.view" }, async ({ current, request }) =>
  json(
    await getDashboardSchedule(
      current.actor,
      parseQuery(request, ["branchId", "weekday", "step"], scheduleSchema),
    ),
  ),
);
