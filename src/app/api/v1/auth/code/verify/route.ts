import { NextResponse } from "next/server";

import { codeVerifySchema } from "@/lib/validation/sign-in";
import { isAppRequest } from "@/server/auth/app-client";
import { applySessionCookies } from "@/server/auth/session";
import { route } from "@/server/http/handler";
import { verifySignInCode } from "@/server/services/sign-in/code.service";
import { requestHost, setStudentCookie } from "@/server/services/student-auth/http";

/**
 * Step two (A-196): the code from the chat. A staff member, a student or a
 * parent is signed in; a phone Kampus does not know lands on the waiting list.
 */
export const POST = route(
  { auth: false, body: codeVerifySchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const app = isAppRequest(request);
    const outcome = await verifySignInCode(
      { ...body, host: requestHost(request) },
      { ip, userAgent: request.headers.get("user-agent"), app },
    );
    if (outcome.kind === "waiting") return NextResponse.json({ ok: false, join: outcome.join });
    if (app) {
      // The phone app keeps no cookies: it gets the token itself (A-203).
      return NextResponse.json({
        ok: true,
        to: outcome.kind,
        offerPassword: outcome.offerPassword,
        token: outcome.kind === "staff" ? outcome.issued.token : outcome.token,
      });
    }
    const response = NextResponse.json({
      ok: true,
      to: outcome.kind,
      offerPassword: outcome.offerPassword,
    });
    if (outcome.kind === "staff") applySessionCookies(response, outcome.issued);
    else setStudentCookie(response, outcome.token);
    return response;
  },
);
