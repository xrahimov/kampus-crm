import { locales, routing, type AppLocale } from "@/i18n/routing";
import { json, route } from "@/server/http/handler";
import { getPortalReferral } from "@/server/services/students/referrals.service";

type Params = { token: string };

/**
 * The student's invite code, the link that carries it and how many friends
 * joined (A-120), for the phone app (A-216). `?locale=` picks the language of
 * the form the link opens.
 */
export const GET = route<undefined, Params>({ auth: false }, async ({ params, request }) => {
  const asked = request.nextUrl.searchParams.get("locale");
  const locale = locales.includes(asked as AppLocale)
    ? (asked as AppLocale)
    : routing.defaultLocale;
  const referral = await getPortalReferral(params.token, locale);
  return referral ? json(referral) : new Response(null, { status: 404 });
});
