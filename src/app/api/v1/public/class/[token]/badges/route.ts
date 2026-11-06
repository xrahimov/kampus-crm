import { json, route } from "@/server/http/handler";
import { getPortalBadges } from "@/server/services/badges/badges.service";

type Params = { token: string };

/** The student's own badges (A-163). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const badges = await getPortalBadges(params.token);
  return badges ? json(badges) : new Response(null, { status: 404 });
});
