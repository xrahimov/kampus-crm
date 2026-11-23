import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import { signInOptions } from "@/server/services/staff-telegram-login.service";
import { requestHost } from "@/server/services/student-auth/http";

/**
 * What a sign-in offers on this address (A-203), for the phone app: whether a
 * bot can send a Telegram code and which bot it is. The website's sign-in page
 * gets the same from the server when it renders.
 */
export const GET = route({ auth: false }, async ({ request }) => {
  const options = await signInOptions(prisma, requestHost(request));
  return json({ code: options.code, bot: options.bot, brand: options.brand });
});
