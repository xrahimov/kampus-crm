import { financeCategorySchema, financePeriodSchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { createCategory, listCategories } from "@/server/services/finance/categories.service";

import { parseQuery } from "../_query";

/** Expense and income categories with their totals for `?branchId&year&month`. */
export const GET = route({ permission: "finance.view" }, async ({ current, request }) =>
  json(
    await listCategories(
      current.actor,
      parseQuery(request, ["branchId", "year", "month"], financePeriodSchema),
    ),
  ),
);

/** "+ BO'LIM". */
export const POST = route<typeof financeCategorySchema._output>(
  { permission: "finance.create", body: financeCategorySchema },
  async ({ current, body }) => json(await createCategory(current.actor, body), { status: 201 }),
);
