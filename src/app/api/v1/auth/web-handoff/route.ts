import { NextResponse } from "next/server";
import { z } from "zod";

import { FROM_APP_COOKIE, FROM_APP_SECONDS } from "@/lib/from-app";
import { applySessionCookies } from "@/server/auth/session";
import { json, route } from "@/server/http/handler";
import { createWebHandoff, redeemWebHandoff } from "@/server/services/sign-in/web-handoff.service";

const bodySchema = z.object({ to: z.string().min(1).max(500) });

/** The phone app asks for a one-minute link that opens a page of the site signed in (A-204). */
export const POST = route<typeof bodySchema._output>(
  { body: bodySchema },
  async ({ current, body }) => {
    const { code, expiresAt } = await createWebHandoff(current.session, body.to);
    return json({
      path: `/api/v1/auth/web-handoff?code=${code}`,
      expiresAt: expiresAt.toISOString(),
    });
  },
);

/**
 * The link itself, opened in the phone's browser: signs that browser in and
 * goes on to the page. A link that is used, old or unknown leads to the
 * sign-in page instead.
 */
export const GET = route({ auth: false }, async ({ request, ip }) => {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  const result = await redeemWebHandoff(code, {
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  // A relative address: the browser stays on whichever name it used for Kampus.
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: result ? result.path : "/", "Cache-Control": "no-store" },
  });
  if (result) {
    applySessionCookies(response, result.issued);
    // The person asked the app for one page: the day's summary must not open over it (A-234).
    response.cookies.set(FROM_APP_COOKIE, "1", {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: FROM_APP_SECONDS,
    });
  }
  return response;
});
