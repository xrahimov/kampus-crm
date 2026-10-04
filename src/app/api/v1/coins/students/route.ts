import { json, route } from "@/server/http/handler";
import { searchCoinStudents } from "@/server/services/coins/coins.service";

/** `?q=` student picker with balances, for purchase requests. */
export const GET = route({}, async ({ current, request }) =>
  json(await searchCoinStudents(current.actor, request.nextUrl.searchParams.get("q") ?? "")),
);
