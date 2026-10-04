import { json, route } from "@/server/http/handler";
import { searchFinanceStudents } from "@/server/services/finance/entries.service";

/** `?q=` autocomplete for the "TALABA" counterparty of an expense or income. */
export const GET = route({ permission: "finance.view" }, async ({ current, request }) =>
  json(await searchFinanceStudents(current.actor, request.nextUrl.searchParams.get("q") ?? "")),
);
