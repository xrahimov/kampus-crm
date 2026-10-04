import { json, route } from "@/server/http/handler";
import { getFinanceOptions } from "@/server/services/finance/entries.service";

/** Staff, payment methods, categories and branches for the finance dialogs. */
export const GET = route({ permission: "finance.view" }, async ({ current }) =>
  json(await getFinanceOptions(current.actor)),
);
