import { NextResponse } from "next/server";

import { passwordSignInSchema } from "@/lib/validation/sign-in";
import { applySessionCookies } from "@/server/auth/session";
import { route } from "@/server/http/handler";
import { organizationForHost } from "@/server/services/settings/domains.service";
import { passwordSignIn } from "@/server/services/sign-in/password.service";
import { requestHost, setStudentCookie } from "@/server/services/student-auth/http";

/**
 * Phone and password, for staff and for students and parents (A-196). `to`
 * says which side of Kampus opened, so the page knows where to go.
 */
export const POST = route(
  { auth: false, body: passwordSignInSchema, skipCsrf: true },
  async ({ body, request, ip }) => {
    const brand = await organizationForHost(requestHost(request));
    const result = await passwordSignIn(
      { ...body, scopeOrganizationId: brand?.organizationId ?? null },
      { ip, userAgent: request.headers.get("user-agent") },
    );
    if (result.kind === "student") {
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
    const response = NextResponse.json({
      ok: true,
      to: "staff",
      csrfToken: result.outcome.issued.csrfToken,
    });
    applySessionCookies(response, result.outcome.issued);
    return response;
  },
);
