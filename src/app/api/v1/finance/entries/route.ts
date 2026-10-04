import { financeEntryFilterSchema, financeEntrySchema } from "@/lib/validation/finance";
import { json, route } from "@/server/http/handler";
import { createEntry, listEntries } from "@/server/services/finance/entries.service";

import { parseQuery } from "../_query";

/** Ledger rows: `?type&categoryId&branchId&year&month&paymentMethodId&staffId`. */
export const GET = route({ permission: "finance.view" }, async ({ current, request }) =>
  json(
    await listEntries(
      current.actor,
      parseQuery(
        request,
        ["type", "categoryId", "branchId", "year", "month", "paymentMethodId", "staffId"],
        financeEntryFilterSchema,
      ),
    ),
  ),
);

/** AVANS BERISH, MARKETING QO'SHISH, CHIQIM KIRITISH, BONUS BERISH, JARIMA BERISH, INVESTITSIYA YARATISH. */
export const POST = route<typeof financeEntrySchema._output>(
  { permission: "finance.create", body: financeEntrySchema },
  async ({ current, body }) => json(await createEntry(current.actor, body), { status: 201 }),
);
