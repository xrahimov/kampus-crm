import { json, route } from "@/server/http/handler";
import { getToday } from "@/server/services/today/today.service";

/** `?date=YYYY-MM-DD` (default today in Tashkent) → the day's lessons, next lesson and debtors. */
export const GET = route({ permission: "groups.view" }, async ({ current, request }) =>
  json(await getToday(current.actor, request.nextUrl.searchParams.get("date") ?? undefined)),
);
