import { financePeriodSchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { countCashCloses } from "@/server/services/finance/cash-close.service";
import { sumEntriesByType } from "@/server/services/finance/entries.service";

import { parseQuery } from "../_query";

/**
 * The sums the Finance page writes on its links, for the phone app (A-237):
 * the period's entries added up by type (advances, marketing, bonuses, fines,
 * investments) and how many cashier day closes it has, with how many still
 * wait for the hand-over. `?branchId&year&month`. The site's page reads the
 * same two services itself.
 */
export const GET = route({ permission: "finance.view" }, async ({ current, request }) => {
  const period = parseQuery(request, ["branchId", "year", "month"], financePeriodSchema);
  const [byType, cashCloses] = await Promise.all([
    sumEntriesByType(current.actor, period),
    countCashCloses(current.actor, period),
  ]);
  return json({ byType, cashCloses });
});
