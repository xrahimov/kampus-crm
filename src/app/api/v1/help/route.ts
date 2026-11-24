import { json, route } from "@/server/http/handler";
import { getManual, manualLocale } from "@/server/services/help/manual.service";

/**
 * The manual as data, for the phone app (A-252): `?locale=` picks the language.
 * Every signed-in person may read it, as on the site's Help pages; the site
 * owner's article is left out for everyone else.
 */
export const GET = route({}, async ({ current, request }) =>
  json(await getManual(current.actor, manualLocale(request.nextUrl.searchParams.get("locale")))),
);
