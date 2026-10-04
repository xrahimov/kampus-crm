import { churnFilterSchema } from "@/lib/validation/reports";
import { json, route } from "@/server/http/handler";
import { getChurnReport } from "@/server/services/reports/churn.service";

import { parseQuery } from "../../finance/_query";

const CHURN_KEYS = [
  "from",
  "to",
  "branchId",
  "courseId",
  "teacherId",
  "groupId",
  "reason",
  "discount",
];

/** Reports → "Ketish va guruh o'zgarishi tahlili" (EXP §10). */
export const GET = route({ permission: "reports.view" }, async ({ current, request }) =>
  json(await getChurnReport(current.actor, parseQuery(request, CHURN_KEYS, churnFilterSchema))),
);
