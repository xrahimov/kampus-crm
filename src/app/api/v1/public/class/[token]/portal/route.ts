import { json, route } from "@/server/http/handler";
import { getPortalPayOptions } from "@/server/services/payments/online-payments.service";
import { getPortal } from "@/server/services/portal/portal.service";

type Params = { token: string };

/**
 * A student's personal page as data (A-203): lessons, marks, money and results
 * of one membership, plus how it can be paid online. The website renders the
 * same from the server; the phone app reads it here. The token is the credential.
 */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const portal = await getPortal(params.token);
  if (!portal) return new Response(null, { status: 404 });
  return json({ portal, pay: await getPortalPayOptions(params.token) });
});
