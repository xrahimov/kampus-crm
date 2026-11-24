import { json, route } from "@/server/http/handler";
import { getChurnOptions } from "@/server/services/reports/churn.service";

/**
 * What the Left students report's filters choose from, for the phone app
 * (A-238): courses, teachers and groups, of one branch with `?branchId`. The
 * site's page reads the same service itself.
 */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) =>
  json(
    await getChurnOptions(current.actor, request.nextUrl.searchParams.get("branchId") ?? undefined),
  ),
);
