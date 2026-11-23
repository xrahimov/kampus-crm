import { NextResponse } from "next/server";

import { passwordSignInSchema } from "@/lib/validation/sign-in";
import { isAppRequest } from "@/server/auth/app-client";
import { applySessionCookies } from "@/server/auth/session";
import { route } from "@/server/http/handler";
import { organizationForHost } from "@/server/services/settings/domains.service";
import { passwordSignIn } from "@/server/services/sign-in/password.service";
import { requestHost, setStudentCookie } from "@/server/services/student-auth/http";

/**
 * Phone and password, for staff and for students and parents (A-196). `to`
 * says which side of Kampus opened, so the page knows where to go. The phone
 * app (A-203) keeps no cookies: it gets the session token in the answer.
 */
export const POST = route(
  { auth: false, body: passwordSignInSchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const app = isAppRequest(request);
    const brand = await organizationForHost(requestHost(request));
    const result = await passwordSignIn(
      { ...body, scopeOrganizationId: brand?.organizationId ?? null },
      { ip, userAgent: request.headers.get("user-agent"), app },
    );
    if (result.kind === "student") {
      if (app) return NextResponse.json({ ok: true, to: "student", token: result.token });
      const response = NextResponse.json({ ok: true, to: "student" });
      setStudentCookie(response, result.token);
      return response;
    }
    if (result.outcome.kind === "challenge") {
      // The password was right; the browser now asks for the Telegram code (A-124).
      return NextResponse.json({
        ok: false,
        challenge: { id: result.outcome.challengeId, expiresAt: result.outcome.expiresAt },
      });
    }
    if (app) {
      return NextResponse.json({ ok: true, to: "staff", token: result.outcome.issued.token });
    }
    const response = NextResponse.json({
      ok: true,
      to: "staff",
      csrfToken: result.outcome.issued.csrfToken,
    });
    applySessionCookies(response, result.outcome.issued);
    return response;
  },
);
