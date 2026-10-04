import { json, route } from "@/server/http/handler";
import { globalSearch } from "@/server/services/dashboard/search.service";

/** Header "Qidirish..." (EXP §0): `?q=` over students, leads and groups the user may see. */
export const GET = route({}, async ({ current, request }) =>
  json(await globalSearch(current.actor, request.nextUrl.searchParams.get("q") ?? "")),
);
