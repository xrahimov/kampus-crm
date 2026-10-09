import { referralsReportFilterSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { getReferralsReport } from "@/server/services/students/referrals.service";

import { parseReport } from "../_period";

/** Reports → Referral programme (A-120). */
export const GET = route({ permission: "reports.leads" }, async ({ current, request }) =>
  json(
    await getReferralsReport(current.actor, parseReport(request, [], referralsReportFilterSchema)),
  ),
);
