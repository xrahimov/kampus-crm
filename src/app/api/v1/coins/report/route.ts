import { coinRatingFilterSchema } from "@/lib/validation/coins";
import { json, route } from "@/server/http/handler";
import { getCoinsReport } from "@/server/services/coins/coins.service";

import { parseQuery } from "../../finance/_query";

/** Reports → Coins: KPIs and the rating (EXP §10). */
export const GET = route({}, async ({ current, request }) =>
  json(
    await getCoinsReport(
      current.actor,
      parseQuery(
        request,
        ["q", "branchId", "courseId", "groupId", "period"],
        coinRatingFilterSchema,
      ),
    ),
  ),
);
