import { json, route } from "@/server/http/handler";
import { manualLocale, searchManual } from "@/server/services/help/manual.service";

/** The site's search over the manual, for the phone app (A-252): `?q=` in the language of `?locale=`. */
export const GET = route({}, async ({ current, request }) => {
  const query = request.nextUrl.searchParams;
  return json(searchManual(current.actor, manualLocale(query.get("locale")), query.get("q") ?? ""));
});
